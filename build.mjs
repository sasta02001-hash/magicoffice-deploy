import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE = 'https://magicoffice.vercel.app/';
const HOST = new URL(SOURCE).host;
const RELEASE = 'home-static-background-restored-2026-08-31-v3';
const BG = '/assets/media/44049d5f46ae6a12.webp';
const BG_SHA = '44049d5f46ae6a12665e7a658e4d4a344fa8078dfd2fbb06da725ebd8e40cc65';
const BG_BYTES = 134272;
const DIST = path.resolve('dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; MagicOffice-Homepage-Background-Restore/3.0)',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

async function get(url, retries = 5) {
  let last;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      if (new URL(response.url).host !== HOST) throw new Error(`Unexpected redirect ${url} -> ${response.url}`);
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        type: (response.headers.get('content-type') || '').split(';')[0].toLowerCase(),
        url: response.url,
      };
    } catch (error) {
      last = error;
      if (attempt + 1 < retries) await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  throw last;
}

function target(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (!clean || clean.includes('..')) throw new Error(`Unsafe path ${urlPath}`);
  return path.join(DIST, clean);
}

function write(urlPath, buffer) {
  const file = target(urlPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

function localUrl(raw, base = SOURCE) {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || /^(?:#|data:|blob:|javascript:|mailto:|tel:)/i.test(value)) return null;
  const url = new URL(value, base);
  if (url.host !== HOST || url.pathname === '/' || url.pathname.endsWith('/')) return null;
  return url;
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WEBP') return null;
  const kind = buffer.subarray(12, 16).toString();
  if (kind === 'VP8 ') {
    const offset = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (offset < 0) return null;
    return {
      width: buffer.readUInt16LE(offset + 3) & 0x3fff,
      height: buffer.readUInt16LE(offset + 5) & 0x3fff,
    };
  }
  if (kind === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (kind === 'VP8L' && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

const home = await get(`${SOURCE}?bg-build=${Date.now()}`);
let html = home.buffer.toString('utf8');
for (const marker of ['MagicOffice', 'homepage-hero-v2', 'mo-home-motion-bg', '立即訂位', 'home-hero-stage']) {
  if (!html.includes(marker)) throw new Error(`Missing source marker ${marker}`);
}

const queue = [];
const seen = new Set();
const mirrored = [];
const skipped = [];

function add(raw, base = SOURCE) {
  let url;
  try {
    url = localUrl(raw, base);
  } catch {
    return;
  }
  if (url && !seen.has(url.pathname)) queue.push(url);
}

for (const match of html.matchAll(/(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
for (const match of html.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
  for (const part of match[1].split(',')) add(part.trim().split(/\s+/)[0]);
}
for (const required of ['/site.webmanifest', '/assets/css/site-v2.0.6.css', '/assets/js/magic-core-js.js', BG]) add(required);

while (queue.length) {
  const url = queue.shift();
  if (!url || seen.has(url.pathname)) continue;
  seen.add(url.pathname);

  try {
    const result = await get(url.href);
    const extension = path.extname(url.pathname).toLowerCase();
    const head = result.buffer.subarray(0, 80).toString('utf8').trimStart().toLowerCase();
    const binary = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.mp4', '.webm', '.woff', '.woff2'].includes(extension);
    if (binary && (head.startsWith('<!doctype html') || head.startsWith('<html'))) {
      if (url.pathname === '/assets/og-card.jpg') {
        skipped.push(url.pathname);
        continue;
      }
      throw new Error('binary asset resolved to HTML');
    }

    write(url.pathname, result.buffer);
    mirrored.push({
      path: url.pathname,
      bytes: result.buffer.length,
      sha256: crypto.createHash('sha256').update(result.buffer).digest('hex'),
    });

    let text = null;
    if (result.type.startsWith('text/') || ['.css', '.js', '.json', '.webmanifest', '.svg'].includes(extension)) {
      text = result.buffer.toString('utf8');
    }

    if (text && extension === '.css') {
      for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1], result.url);
      for (const match of text.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) add(match[1], result.url);
    } else if (text && extension === '.js') {
      for (const match of text.matchAll(/["']((?:\/assets\/|\/site\.webmanifest|\/favicon\.png|\/apple-touch-icon\.png)[^"']*)["']/g)) add(match[1], result.url);
    } else if (text && (extension === '.json' || extension === '.webmanifest')) {
      try {
        const payload = JSON.parse(text);
        for (const icon of payload?.icons || []) if (icon?.src) add(icon.src, result.url);
      } catch {}
    }
  } catch (error) {
    throw new Error(`Mirror failed ${url.href}: ${error.message}`);
  }
}

if (mirrored.length < 45) throw new Error(`Only mirrored ${mirrored.length} assets`);

const background = fs.readFileSync(target(BG));
const backgroundSha = crypto.createHash('sha256').update(background).digest('hex');
const dimensions = webpDimensions(background);
if (background.length !== BG_BYTES || backgroundSha !== BG_SHA || dimensions?.width !== 1000 || dimensions?.height !== 1333) {
  throw new Error(`Background verification failed ${background.length} ${backgroundSha} ${JSON.stringify(dimensions)}`);
}

html = html
  .replace(/<meta\s+name=["']x-magicoffice-home-static-background["'][^>]*>/gi, '')
  .replace(/<link\s+[^>]*id=["']magicoffice-home-static-background-preload["'][^>]*>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-static-background-v\d+["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<div\s+class=["']mo-home-static-bg["'][^>]*>[\s\S]*?<\/div>/gi, '');

const css = `<meta name="x-magicoffice-home-static-background" content="${RELEASE}"/><link id="magicoffice-home-static-background-preload" rel="preload" as="image" href="${BG}?v=20260831-bg3" fetchpriority="high"/><style id="magicoffice-home-static-background-v3">.homepage-hero-v2{position:relative!important;isolation:isolate!important;overflow:hidden!important;background:#080607!important}.homepage-hero-v2::before,.homepage-hero-v2::after{content:none!important;display:none!important;background:none!important}.mo-home-static-bg{position:absolute!important;inset:0!important;z-index:0!important;display:block!important;visibility:visible!important;opacity:1!important;overflow:hidden!important;pointer-events:none!important;user-select:none!important;background:#080607!important}.mo-home-static-bg-image{position:absolute!important;inset:-1.5%!important;width:103%!important;height:103%!important;max-width:none!important;display:block!important;visibility:visible!important;opacity:1!important;object-fit:cover!important;object-position:68% 28%!important;filter:saturate(.84) brightness(.78) contrast(.98)!important;transform:translateZ(0)!important}.mo-home-static-bg-shade{position:absolute!important;inset:0!important;display:block!important;background:linear-gradient(90deg,rgba(5,4,4,.58) 0%,rgba(9,6,7,.36) 40%,rgba(9,6,7,.18) 74%,rgba(5,4,4,.35) 100%),linear-gradient(to top,rgba(8,6,7,.76) 0%,transparent 32%)!important}.mo-home-motion-bg{z-index:1!important}.homepage-hero-v2>.home-hero-shell{position:relative!important;z-index:3!important}@media(max-width:960px){.mo-home-static-bg-image{object-position:63% 24%!important;filter:saturate(.84) brightness(.74) contrast(.98)!important}.mo-home-static-bg-shade{background:linear-gradient(to top,rgba(5,4,4,.82) 3%,rgba(7,5,6,.48) 57%,rgba(7,5,6,.12)),linear-gradient(90deg,rgba(5,4,4,.30),transparent)!important}}@media(prefers-reduced-motion:reduce){.mo-home-static-bg{display:block!important}.mo-home-static-bg-image{transform:none!important}}</style>`;
if (!html.includes('</head>')) throw new Error('Missing </head>');
html = html.replace('</head>', `${css}</head>`);

const layer = `<div class="mo-home-static-bg" aria-hidden="true"><img class="mo-home-static-bg-image" src="${BG}?v=20260831-bg3" width="1000" height="1333" alt="" decoding="async" fetchpriority="high"/><span class="mo-home-static-bg-shade"></span></div>`;
const hero = /(<section\b[^>]*class=["'][^"']*\bhomepage-hero-v2\b[^"']*["'][^>]*>)/i;
if (!hero.test(html)) throw new Error('Hero not found');
html = html.replace(hero, `$1${layer}`);

for (const marker of [RELEASE, 'class="mo-home-static-bg"', 'class="mo-home-static-bg-image"', 'class="mo-home-motion-bg"', 'mo-home-petal-fall', 'home-hero-stage', '立即訂位', '心跳應援']) {
  if (!html.includes(marker)) throw new Error(`Patch missing ${marker}`);
}
if ((html.match(/class="mo-home-static-bg"/g) || []).length !== 1) throw new Error('Bad background layer count');
if ((html.match(/class="mo-home-petal"/g) || []).length !== 4) throw new Error('Petals changed');

fs.writeFileSync(path.join(DIST, 'index.html'), html);
const health = {
  ok: true,
  release: RELEASE,
  background: { path: BG, bytes: background.length, sha256: backgroundSha, width: dimensions.width, height: dimensions.height },
  petals: 4,
  assetCount: mirrored.length,
  skipped,
};
fs.writeFileSync(path.join(DIST, 'health.json'), JSON.stringify(health, null, 2));
console.log('MAGICOFFICE_VISIBLE_BACKGROUND_OK', JSON.stringify(health));