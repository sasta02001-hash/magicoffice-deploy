import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE = 'https://magicoffice.vercel.app/';
const SOURCE_HOST = new URL(SOURCE).host;
const RELEASE = 'home-original-ukiyoe-restored-2026-08-31-v1';
const BG_PATH = '/assets/media/magicoffice-home-original-ukiyoe.webp';
const BG_SHA256 = '3ba7c9be73e305c8e3de9e4b3f88c1ddc1809022c65a2d98b60acd3134375fde';
const BG_BYTES = 134272;
const ORIGINAL_SOURCE = 'https://drive.usercontent.google.com/download?id=1IvJxaaGMiW3JyhMkKkOqPn44-Q1JAtaF&export=download&confirm=t';
const ORIGINAL_PREFIX = 'UklGRngMAgBXRUJQVlA4IGwMAgCwSwmdASroAzUF';
const DIST = path.resolve('dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const headers = {
  'user-agent': 'Mozilla/5.0 (compatible; MagicOffice-Static-Background-Restore/1.0)',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

async function fetchBuffer(url, retries = 5) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers, redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      const finalUrl = new URL(response.url);
      if (finalUrl.host !== SOURCE_HOST) throw new Error(`Unexpected redirect ${url} -> ${response.url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        buffer,
        contentType: (response.headers.get('content-type') || '').split(';')[0].toLowerCase(),
        finalUrl: response.url,
      };
    } catch (error) {
      last = error;
      if (i + 1 < retries) await new Promise(resolve => setTimeout(resolve, 900 * (i + 1)));
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

const home = await fetchBuffer(`${SOURCE}?static-bg-source=${Date.now()}`);
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
  try { url = sameOriginUrl(raw, baseUrl); } catch { return; }
  if (!url || seen.has(url.pathname)) return;
  queue.push(url);
}

const attrRe = /(?:src|href|poster|content)\s*=\s*["']([^"']+)["']/gi;
const srcsetRe = /srcset\s*=\s*["']([^"']+)["']/gi;
for (const match of html.matchAll(attrRe)) enqueue(match[1]);
for (const match of html.matchAll(srcsetRe)) {
  for (const part of match[1].split(',')) enqueue(part.trim().split(/\s+/)[0]);
}
for (const required of ['/site.webmanifest', '/assets/css/site-v2.0.6.css', '/assets/js/magic-core-js.js']) enqueue(required);

while (queue.length) {
  const url = queue.shift();
  if (!url || seen.has(url.pathname)) continue;
  seen.add(url.pathname);
  try {
    const result = await fetchBuffer(url.href);
    const head = result.buffer.subarray(0, 80).toString('utf8').trimStart().toLowerCase();
    const ext = path.extname(url.pathname).toLowerCase();
    const binaryExpected = ['.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.mp4','.webm','.woff','.woff2'].includes(ext);
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
    if (result.contentType.startsWith('text/') || ['.css','.js','.json','.webmanifest','.svg'].includes(ext)) {
      try { text = result.buffer.toString('utf8'); } catch {}
    }
    if (text && ext === '.css') {
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) enqueue(m[1], result.finalUrl);
      for (const m of text.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) enqueue(m[1], result.finalUrl);
    } else if (text && ext === '.js') {
      for (const m of text.matchAll(/["']((?:\/assets\/|\/site\.webmanifest|\/favicon\.png|\/apple-touch-icon\.png)[^"']*)["']/g)) enqueue(m[1], result.finalUrl);
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

if (downloaded.length < 45) throw new Error(`Only mirrored ${downloaded.length} current assets; expected at least 45`);

// Recover the exact original 1000×1333 WebP from the archived v2.0.7 source.
const originalResponse = await fetch(ORIGINAL_SOURCE, {
  headers: { 'user-agent': headers['user-agent'], 'cache-control': 'no-cache' },
  redirect: 'follow',
});
if (!originalResponse.ok) throw new Error(`Original source HTTP ${originalResponse.status}`);
const originalHtml = await originalResponse.text();
const originalMarker = `data:image/webp;base64,${ORIGINAL_PREFIX}`;
const originalOffset = originalHtml.indexOf(originalMarker);
if (originalOffset < 0) throw new Error('Exact original background prefix missing from archived source');
const payloadOffset = originalOffset + 'data:image/webp;base64,'.length;
const payloadMatch = originalHtml.slice(payloadOffset).match(/^[A-Za-z0-9+/=]+/);
if (!payloadMatch) throw new Error('Original background data URI is incomplete');
const background = Buffer.from(payloadMatch[0], 'base64');
const backgroundSha = crypto.createHash('sha256').update(background).digest('hex');
if (background.length !== BG_BYTES) throw new Error(`Background byte mismatch ${background.length}`);
if (backgroundSha !== BG_SHA256) throw new Error(`Background SHA mismatch ${backgroundSha}`);
if (background.subarray(0,4).toString() !== 'RIFF' || background.subarray(8,12).toString() !== 'WEBP') {
  throw new Error('Background is not a WebP RIFF file');
}
writeFileForPath(BG_PATH, background);

// Remove any prior static-background patch, while preserving the already restored petal layer.
html = html
  .replace(/<meta\s+name=["']x-magicoffice-home-static-background["'][^>]*>/gi, '')
  .replace(/<link\s+[^>]*id=["']magicoffice-home-static-background-preload["'][^>]*>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-static-background-v1["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<div\s+class=["']mo-home-static-bg["'][^>]*>[\s\S]*?<\/div>/gi, '');

const headPatch = `
<meta name="x-magicoffice-home-static-background" content="${RELEASE}"/>
<link id="magicoffice-home-static-background-preload" rel="preload" as="image" href="${BG_PATH}?v=20260831-bg1" fetchpriority="high"/>
<style id="magicoffice-home-static-background-v1">
.homepage-hero-v2{position:relative!important;isolation:isolate!important;overflow:hidden!important;background:#07080c!important}
.homepage-hero-v2::before,.homepage-hero-v2::after{content:none!important;display:none!important;background:none!important}
.mo-home-static-bg{position:absolute!important;inset:0!important;z-index:0!important;overflow:hidden!important;pointer-events:none!important;user-select:none!important}
.mo-home-static-bg-image,.mo-home-static-bg-shade{position:absolute!important;inset:0!important;display:block!important;pointer-events:none!important}
.mo-home-static-bg-image{inset:-1.5%!important;background-image:url('${BG_PATH}?v=20260831-bg1')!important;background-repeat:no-repeat!important;background-size:cover!important;background-position:68% 28%!important;filter:saturate(.78) brightness(.62)!important;transform:scale(1.015)!important;transform-origin:center!important}
.mo-home-static-bg-shade{background:linear-gradient(90deg,rgba(6,6,9,.76) 0%,rgba(6,6,9,.55) 42%,rgba(6,6,9,.25) 100%),linear-gradient(0deg,rgba(7,8,12,.85) 0%,transparent 48%,rgba(7,8,12,.25) 100%)!important}
.mo-home-motion-bg{z-index:1!important}
.homepage-hero-v2>.home-hero-shell{position:relative!important;z-index:3!important}
@media(max-width:640px){.mo-home-static-bg-image{background-position:58% center!important}}
@media(prefers-reduced-motion:reduce){.mo-home-static-bg{display:block!important}.mo-home-static-bg-image{transform:scale(1.015)!important}}
</style>`;
if (!html.includes('</head>')) throw new Error('Current Production HTML is missing </head>');
html = html.replace('</head>', `${headPatch}\n</head>`);

const layer = `
<div class="mo-home-static-bg" aria-hidden="true">
  <span class="mo-home-static-bg-image"></span>
  <span class="mo-home-static-bg-shade"></span>
</div>`;
const heroOpen = /(<section\b[^>]*class=["'][^"']*\bhomepage-hero-v2\b[^"']*["'][^>]*>)/i;
if (!heroOpen.test(html)) throw new Error('Could not locate homepage hero opening tag');
html = html.replace(heroOpen, `$1${layer}`);

const requiredAfterPatch = [
  RELEASE,
  'class="mo-home-static-bg"',
  'class="mo-home-motion-bg"',
  'mo-home-petal-fall',
  'home-hero-stage',
  '立即訂位',
  '心跳應援',
];
for (const marker of requiredAfterPatch) if (!html.includes(marker)) throw new Error(`Patched HTML missing ${marker}`);
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
    width: 1000,
    height: 1333,
    objectPositionDesktop: '68% 28%',
    objectPositionMobile: '58% center',
  },
  petalsPreserved: 4,
  assetCount: downloaded.length,
  assetBytes: downloaded.reduce((n, item) => n + item.bytes, 0),
  skipped,
};
fs.writeFileSync(path.join(DIST, 'health.json'), JSON.stringify(health, null, 2));
console.log('MAGICOFFICE_ORIGINAL_STATIC_BACKGROUND_OK', JSON.stringify(health));
