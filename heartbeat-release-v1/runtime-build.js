const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');
const SOURCE = process.env.MAGICOFFICE_SOURCE || 'https://magicoffice.vercel.app/';
const SOURCE_ORIGIN = new URL(SOURCE).origin;
const BUILD_TAG = 'heartbeat-support-2026-08-30-v3-inline-image';
const IMAGE_B64_URL = 'https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/new-domain-v1.0.4-menu-cms/heartbeat-release-v1/heartbeat-image.b64';

function isSkippable(raw) {
  if (!raw) return true;
  const value = raw.trim().replace(/^[\"']|[\"']$/g, '');
  if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) return true;
  if (/%23/i.test(value)) return true;
  return false;
}

function extractRefs(text, contentType, parentUrl) {
  const refs = new Set();
  const add = (raw) => {
    if (!raw || isSkippable(raw)) return;
    let clean = raw.trim().replace(/^[\"']|[\"']$/g, '').replace(/&amp;/g, '&');
    if (!clean || clean.startsWith('#') || clean.startsWith('data:')) return;
    try {
      const u = new URL(clean, parentUrl);
      if (u.origin !== SOURCE_ORIGIN) return;
      if (/%23/i.test(u.pathname)) return;
      if (!(u.pathname.startsWith('/assets/') || u.pathname === '/site.webmanifest')) return;
      refs.add(u.href);
    } catch (_) {}
  };

  if (/html/i.test(contentType)) {
    const attr = /\b(?:src|href)\s*=\s*[\"']([^\"']+)[\"']/gi;
    for (const match of text.matchAll(attr)) add(match[1]);
    const srcset = /\bsrcset\s*=\s*[\"']([^\"']+)[\"']/gi;
    for (const match of text.matchAll(srcset)) {
      for (const part of match[1].split(',')) add(part.trim().split(/\s+/)[0]);
    }
  }

  const cssUrl = /url\(\s*[\"']?([^\"')]+)[\"']?\s*\)/gi;
  for (const match of text.matchAll(cssUrl)) add(match[1]);

  const absoluteLocal = /[\"'`](\/(?:assets\/|site\.webmanifest)[^\"'`\s)<>]*)[\"'`]/gi;
  for (const match of text.matchAll(absoluteLocal)) add(match[1]);
  return [...refs];
}

async function fetchResponse(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'MagicOffice-heartbeat-production-builder/1.1',
          'cache-control': 'no-cache'
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw last;
}

function localPathFromUrl(url) {
  const u = new URL(url);
  let pathname = decodeURIComponent(u.pathname);
  if (pathname.includes('#') || pathname.includes('..')) throw new Error(`Unsafe local asset path: ${pathname}`);
  pathname = pathname.replace(/^\/+/, '');
  return path.join(OUT, pathname);
}

async function mirrorAssets(seedUrls) {
  const queue = [...seedUrls];
  const seen = new Set();
  while (queue.length) {
    const assetUrl = queue.shift();
    if (!assetUrl || seen.has(assetUrl)) continue;
    seen.add(assetUrl);
    const u = new URL(assetUrl);
    if (u.origin !== SOURCE_ORIGIN || /%23/i.test(u.pathname)) continue;

    const localPath = localPathFromUrl(assetUrl);
    let response;
    try {
      response = await fetchResponse(assetUrl);
    } catch (error) {
      console.warn('WARN mirror failed', u.pathname, error.message);
      if (u.pathname.startsWith('/assets/') || u.pathname === '/site.webmanifest') {
        throw new Error(`Critical asset mirror failed: ${u.pathname} ${error.message}`);
      }
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(localPath), {recursive: true});
    await fs.writeFile(localPath, buffer);
    console.log('Mirrored', u.pathname, `(${buffer.length} bytes)`);

    const contentType = response.headers.get('content-type') || '';
    const isText = /text\/(css|javascript|html)|application\/(javascript|json|manifest\+json)|\.css$|\.js$/i.test(contentType + u.pathname);
    if (isText) {
      const body = buffer.toString('utf8');
      for (const ref of extractRefs(body, contentType, assetUrl)) {
        if (!seen.has(ref)) queue.push(ref);
      }
    }
  }
}

function inlineHeartbeatImage(html, imageB64) {
  if (!html.includes('id=\"heartbeat-support\"')) throw new Error('Heartbeat event missing from production source');
  if (!imageB64 || imageB64.length < 10000) throw new Error('Heartbeat image payload is unexpectedly small');

  const dataUri = `data:image/webp;base64,${imageB64}`;
  let output = html.replace(
    /(<figure class=\"heartbeat-support-poster\">\s*<img[^>]*?)\sloading=\"lazy\"([^>]*?)\ssrc=\"\/assets\/media\/heartbeat-support\.webp(?:\?[^\"]*)?\"([^>]*>)/,
    `$1 loading=\"eager\" fetchpriority=\"high\"$2 src=\"${dataUri}\"$3`
  );

  if (output === html) {
    output = html.replace(/src=\"\/assets\/media\/heartbeat-support\.webp(?:\?[^\"]*)?\"/, `src=\"${dataUri}\"`);
    output = output.replace(/(<figure class=\"heartbeat-support-poster\">\s*<img[^>]*?)loading=\"lazy\"/, '$1loading=\"eager\" fetchpriority=\"high\"');
  }

  output = output.replace(
    /<meta name=\"x-magicoffice-heartbeat-release\" content=\"[^\"]*\"\s*\/?>/,
    `<meta name=\"x-magicoffice-heartbeat-release\" content=\"${BUILD_TAG}\"/>`
  );
  if (!output.includes(`content=\"${BUILD_TAG}\"`)) {
    output = output.replace('</head>', `<meta name=\"x-magicoffice-heartbeat-release\" content=\"${BUILD_TAG}\"/>\n</head>`);
  }

  const fallbackCss = `\n<style id=\"heartbeat-inline-image-guard\">\n.heartbeat-support-poster{min-height:280px;display:flex;flex-direction:column;justify-content:center}\n.heartbeat-support-poster img{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:auto!important;object-fit:contain}\n@media(max-width:820px){.heartbeat-support-poster{min-height:180px}}\n</style>`;
  if (!output.includes('id=\"heartbeat-inline-image-guard\"')) output = output.replace('</head>', `${fallbackCss}\n</head>`);
  return output;
}

async function main() {
  await fs.rm(OUT, {recursive: true, force: true});
  await fs.mkdir(OUT, {recursive: true});

  const sourceResponse = await fetchResponse(new URL(`?heartbeat-inline=${Date.now()}`, SOURCE).href);
  const sourceHtml = await sourceResponse.text();
  if (!sourceHtml.includes('MagicOffice') || !sourceHtml.includes('id=\"event-hub\"')) throw new Error('Source baseline mismatch');

  const imageResponse = await fetchResponse(IMAGE_B64_URL);
  const imageB64 = (await imageResponse.text()).replace(/\s+/g, '');
  const html = inlineHeartbeatImage(sourceHtml, imageB64);
  await fs.writeFile(path.join(OUT, 'index.html'), html, 'utf8');

  const seedUrls = extractRefs(html, 'text/html', SOURCE);
  await mirrorAssets(seedUrls);

  const marker = {
    build: BUILD_TAG,
    source: SOURCE,
    event: 'heartbeat-support',
    imageDelivery: 'inline-data-uri',
    generatedAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(OUT, 'heartbeat-build.json'), JSON.stringify(marker, null, 2));

  const final = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
  for (const must of ['id=\"heartbeat-support\"', '心跳應援', '2026.09.01–09.15', '訂位即送小卡一張', 'data:image/webp;base64,']) {
    if (!final.includes(must)) throw new Error(`Final verification missing: ${must}`);
  }
  console.log('MAGICOFFICE_HEARTBEAT_INLINE_BUILD_OK', BUILD_TAG, 'assets', seedUrls.length, 'imageChars', imageB64.length);
}

main().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
