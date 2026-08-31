import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE = 'https://magicoffice.vercel.app/';
const SOURCE_HOST = new URL(SOURCE).host;
const RELEASE = 'home-static-background-restored-2026-08-31-v3';
const BG_PATH = '/assets/media/44049d5f46ae6a12.webp';
const BG_SHA256 = '44049d5f46ae6a12665e7a658e4d4a344fa8078dfd2fbb06da725ebd8e40cc65';
const BG_BYTES = 134272;
const DIST = path.resolve('dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const headers = {
  'user-agent': 'Mozilla/5.0 (compatible; MagicOffice-Homepage-Background-Restore/3.0)',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

async function fetchBuffer(url, retries = 5) {
  let last;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers, redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      const finalUrl = new URL(response.url);
      if (finalUrl.host !== SOURCE_HOST) {
        throw new Error(`Unexpected redirect ${url} -> ${response.url}`);
      }
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: (response.headers.get('content-type') || '').split(';')[0].toLowerCase(),
        finalUrl: response.url,
      };
    } catch (error) {
      last = error;
      if (attempt + 1 < retries) {
        await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
      }
    }
  }
  throw last;
}

function outputPath(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (!clean || clean.includes('..')) throw new Error(`Unsafe path ${urlPath}`);
  return path.join(DIST, clean);
}

function writeFileForPath(urlPath, data) {
  const target = outputPath(urlPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}

function sameOriginUrl(raw, baseUrl = SOURCE) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /^(?:#|data:|blob:|javascript:|mailto:|tel:)/i.test(trimmed)) return null;
  const url = new URL(trimmed, baseUrl);
  if (url.host !== SOURCE_HOST) return null;
  if (url.pathname === '/' || url.pathname.endsWith('/')) return null;
  return url;
}

function webpDimensions(data) {
  if (data.length < 30 || data.subarray(0, 4).toString() !== 'RIFF' || data.subarray(8, 12).toString() !== 'WEBP') {
    return null;
  }
  const kind = data.subarray(12, 16).toString();
  if (kind === 'VP8 ') {
    const signature = Buffer.from([0x9d, 0x01, 0x2a]);
    const offset = data.indexOf(signature, 20);
    if (offset < 0 || offset + 7 > data.length) return null;
    return {
      width: data.readUInt16LE(offset + 3) & 0x3fff,
      height: data.readUInt16LE(offset + 5) & 0x3fff,
    };
  }
  if (kind === 'VP8X') {
    return {
      width: 1 + data.readUIntLE(24, 3),
      height: 1 + data.readUIntLE(27, 3),
    };
  }
  if (kind === 'VP8L' && data[20] === 0x2f) {
    const bits = data.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

const home = await fetchBuffer(`${SOURCE}?static-bg-build=${Date.now()}`);
let html = home.buffer.toString('utf8');
for (const marker of ['MagicOffice', 'homepage-hero-v2', 'mo-home-motion-bg', '立即訂位', 'home-hero-stage']) {
  if (!html.includes(marker)) throw new Error(`Current Production source missing marker: ${marker}`);
}

const queue = [];
const seen = new Set();
const downloaded = [];
const skipped = [];

function enqueue(raw, baseUrl = SOURCE) {
  let url;
  try {
    url = sameOriginUrl(raw, baseUrl);
  } catch {
    return;
  }
  if (!url || seen.has(url.pathname)) return;
  queue.push(url);
}

const attrRe = /(?:src|href|poster|content)\s*=\s*["']([^"']+)["']/gi;
const srcsetRe = /srcset\s*=\s*["']([^"']+)["']/gi;
for (const match of html.matchAll(attrRe)) enqueue(match[1]);
for (const match of html.matchAll(srcsetRe)) {
  for (const part of match[1].split(',')) enqueue(part.trim().split(/\s+/)[0]);
}
for (const required of [
  '/site.webmanifest',
  '/assets/css/site-v2.0.6.css',
  '/assets/js/magic-core-js.js',
  BG_PATH,
]) enqueue(required);

while (queue.length) {
  const url = queue.shift();
  if (!url || seen.has(url.pathname)) continue;
  seen.add(url.pathname);

  try {
    const result = await fetchBuffer(url.href);
    const head = result.buffer.subarray(0, 80).toString('utf8').trimStart().toLowerCase();
    const ext = path.extname(url.pathname).toLowerCase();
    const binaryExpected = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.mp4', '.webm', '.woff', '.woff2'].includes(ext);
    if (binaryExpected && (head.startsWith('<!doctype html') || head.startsWith('<html'))) {
      if (url.pathname === '/assets/og-card.jpg') {
        skipped.push({ path: url.pathname, reason: 'existing optional social-card URL resolves to HTML' });
        continue;
      }
      throw new Error(`Binary asset resolved to HTML: ${url.href}`);
    }

    writeFileForPath(url.pathname, result.buffer);
    downloaded.push({
      path: url.pathname,
      bytes: result.buffer.length,
      contentType: result.contentType,
      sha256: crypto.createHash('sha256').update(result.buffer).digest('hex'),
    });

    let text = null;
    if (result.contentType.startsWith('text/') || ['.css', '.js', '.json', '.webmanifest', '.svg'].includes(ext)) {
      try {
        text = result.buffer.toString('utf8');
      } catch {}
    }

    if (text && ext === '.css') {
      for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) enqueue(match[1], result.finalUrl);
      for (const match of text.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) enqueue(match[1], result.finalUrl);
    } else if (text && ext === '.js') {
      for (const match of text.matchAll(/["']((?:\/assets\/|\/site\.webmanifest|\/favicon\.png|\/apple-touch-icon\.png)[^"']*)["']/g)) {
        enqueue(match[1], result.finalUrl);
      }
    } else if (text && (ext === '.json' || ext === '.webmanifest')) {
      try {
        const payload = JSON.parse(text);
        for (const icon of payload?.icons || []) if (icon?.src) enqueue(icon.src, result.finalUrl);
      } catch {}
    }
  } catch (error) {
    throw new Error(`Asset mirror failed for ${url.href}: ${error?.message || error}`);
  }
}

if (downloaded.length < 45) {
  throw new Error(`Only mirrored ${downloaded.length} current assets; expected at least 45`);
}

const backgroundFile = outputPath(BG_PATH);
if (!fs.existsSync(backgroundFile)) throw new Error(`Background asset was not mirrored: ${BG_PATH}`);
const background = fs.readFileSync(backgroundFile);
const backgroundSha = crypto.createHash('sha256').update(background).digest('hex');
const backgroundDimensions = webpDimensions(background);
if (background.length !== BG_BYTES) throw new Error(`Background byte mismatch: ${background.length}`);
if (backgroundSha !== BG_SHA256) throw new Error(`Background SHA mismatch: ${backgroundSha}`);
if (!backgroundDimensions || backgroundDimensions.width !== 1000 || backgroundDimensions.height !== 1333) {
  throw new Error(`Background dimension mismatch: ${JSON.stringify(backgroundDimensions)}`);
}

html = html
  .replace(/<meta\s+name=["']x-magicoffice-home-static-background["'][^>]*>/gi, '')
  .replace(/<link\s+[^>]*id=["']magicoffice-home-static-background-preload["'][^>]*>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-static-background-v\d+["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<div\s+class=["']mo-home-static-bg["'][^>]*>[\s\S]*?<\/div>/gi, '');

const headPatch = `
<meta name="x-magicoffice-home-static-background" content="${RELEASE}"/>
<link id="magicoffice-home-static-background-preload" rel="preload" as="image" href="${BG_PATH}?v=20260831-bg3" fetchpriority="high"/>
<style id="magicoffice-home-static-background-v3">
.homepage-hero-v2{position:relative!important;isolation:isolate!important;overflow:hidden!important;background:#080607!important}
.homepage-hero-v2::before,.homepage-hero-v2::after{content:none!important;display:none!important;background:none!important}
.mo-home-static-bg{position:absolute!important;inset:0!important;z-index:0!important;display:block!important;visibility:visible!important;opacity:1!important;overflow:hidden!important;pointer-events:none!important;user-select:none!important;background:#080607!important}
.mo-home-static-bg-image{position:absolute!important;inset:-1.5%!important;width:103%!important;height:103%!important;max-width:none!important;display:block!important;visibility:visible!important;opacity:1!important;object-fit:cover!important;object-position:68% 28%!important;filter:saturate(.82) brightness(.74) contrast(.98)!important;transform:translateZ(0)!important}
.mo-home-static-bg-shade{position:absolute!important;inset:0!important;display:block!important;background:linear-gradient(90deg,rgba(5,4,4,.72) 0%,rgba(9,6,7,.48) 40%,rgba(9,6,7,.24) 74%,rgba(5,4,4,.46) 100%),linear-gradient(to top,rgba(8,6,7,.88) 0%,transparent 32%)!important}
.mo-home-motion-bg{z-index:1!important}
.homepage-hero-v2>.home-hero-shell{position:relative!important;z-index:3!important}
@media(max-width:960px){
  .mo-home-static-bg-image{object-position:63% 24%!important;filter:saturate(.82) brightness(.70) contrast(.98)!important}
  .mo-home-static-bg-shade{background:linear-gradient(to top,rgba(5,4,4,.92) 3%,rgba(7,5,6,.62) 57%,rgba(7,5,6,.18)),linear-gradient(90deg,rgba(5,4,4,.46),transparent)!important}
}
@media(prefers-reduced-motion:reduce){.mo-home-static-bg{display:block!important}.mo-home-static-bg-image{transform:none!important}}
</style>`;

if (!html.includes('</head>')) throw new Error('Current Production HTML is missing </head>');
html = html.replace('</head>', `${headPatch}\n</head>`);

const layer = `
<div class="mo-home-static-bg" aria-hidden="true">
  <img class="mo-home-static-bg-image" src="${BG_PATH}?v=20260831-bg3" width="1000" height="1333" alt="" decoding="async" fetchpriority="high"/>
  <span class="mo-home-static-bg-shade"></span>
</div>`;
const heroOpen = /(<section\b[^>]*class=["'][^"']*\bhomepage-hero-v2\b[^"']*["'][^>]*>)/i;
if (!heroOpen.test(html)) throw new Error('Could not locate homepage hero opening tag');
html = html.replace(heroOpen, `$1${layer}`);

for (const marker of [
  RELEASE,
  'class="mo-home-static-bg"',
  'class="mo-home-static-bg-image"',
  'class="mo-home-motion-bg"',
  'mo-home-petal-fall',
  'home-hero-stage',
  '立即訂位',
  '心跳應援',
]) {
  if (!html.includes(marker)) throw new Error(`Patched HTML missing ${marker}`);
}
if ((html.match(/class="mo-home-static-bg"/g) || []).length !== 1) throw new Error('Static background layer count is not exactly one');
if ((html.match(/class="mo-home-petal"/g) || []).length !== 4) throw new Error('Petal count changed unexpectedly');

fs.writeFileSync(path.join(DIST, 'index.html'), html);
const health = {
  ok: true,
  release: RELEASE,
  source: SOURCE,
  background: {
    path: BG_PATH,
    bytes: background.length,
    sha256: backgroundSha,
    width: backgroundDimensions.width,
    height: backgroundDimensions.height,
    desktopPosition: '68% 28%',
    mobilePosition: '63% 24%',
  },
  petalsPreserved: 4,
  assetCount: downloaded.length,
  assetBytes: downloaded.reduce((total, item) => total + item.bytes, 0),
  skipped,
};
fs.writeFileSync(path.join(DIST, 'health.json'), JSON.stringify(health, null, 2));
console.log('MAGICOFFICE_VISIBLE_STATIC_BACKGROUND_OK', JSON.stringify(health));