const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');
const SOURCE = process.env.MAGICOFFICE_SOURCE || 'https://magicoffice.vercel.app/';
const SOURCE_ORIGIN = new URL(SOURCE).origin;
const BUILD_TAG = 'heartbeat-support-2026-08-30-v5-static-image';
const HEARTBEAT_PATH = '/assets/media/heartbeat-support-v5.png';
const IMAGE_SOURCE = 'https://media.canva.com/v2/document-image/hash:-733210113/height:335/id:DAHTvA91Tk8/type:B/width:595?brand=BAGPuTF1NEo&csig=AAAAAAAAAAAAAAAAAAAAAFhMu1_RNJKpo-_CfK683lGW6zMC7Qvtp_UozNKyWnZ_&disableexport=T&exp=1788068276&fallback=https%3A%2F%2Fs3.amazonaws.com%2Fdocument-export.canva.com%2F91Tk8%2FDAHTvA91Tk8%2F1%2Fthumbnail%2F0001.png%3FX-Amz-Algorithm%3DAWS4-HMAC-SHA256%26X-Amz-Credential%3DAKIAQYCGKMUH4GDRW44L%252F20260830%252Fus-east-1%252Fs3%252Faws4_request%26X-Amz-Date%3D20260830T024930Z%26X-Amz-Expires%3D10106%26X-Amz-Signature%3D79c0a2be964856026718730883c21ebb0c6361d97437c275e74aff38eda6e15f%26X-Amz-SignedHeaders%3Dhost%26response-expires%3DSun%252C%252030%2520Aug%25202026%252005%253A37%253A56%2520GMT&osig=AAAAAAAAAAAAAAAAAAAAAHvCqTjiLjtVsY7IsP6R-kIgwiGV_qxPUlqRbzE6tIef&page=1&signed=brand%2Cdisableexport%2Cfallback%2Cpage%2Cversion&signer=document-rpc&version=1';

function isSkippable(raw) {
  if (!raw) return true;
  const value = raw.trim().replace(/^[\"']|[\"']$/g, '');
  return !value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:') || /%23/i.test(value);
}

function extractRefs(text, contentType, parentUrl) {
  const refs = new Set();
  const add = (raw) => {
    if (!raw || isSkippable(raw)) return;
    const clean = raw.trim().replace(/^[\"']|[\"']$/g, '').replace(/&amp;/g, '&');
    try {
      const u = new URL(clean, parentUrl);
      if (u.origin !== SOURCE_ORIGIN || /%23/i.test(u.pathname)) return;
      if (!(u.pathname.startsWith('/assets/') || u.pathname === '/site.webmanifest')) return;
      refs.add(u.href);
    } catch (_) {}
  };
  if (/html/i.test(contentType)) {
    const attr = /\b(?:src|href)\s*=\s*[\"']([^\"']+)[\"']/gi;
    for (const match of text.matchAll(attr)) add(match[1]);
    const srcset = /\bsrcset\s*=\s*[\"']([^\"']+)[\"']/gi;
    for (const match of text.matchAll(srcset)) for (const part of match[1].split(',')) add(part.trim().split(/\s+/)[0]);
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
      const response = await fetch(url, {headers:{'user-agent':'MagicOffice-heartbeat-production-builder/1.2','cache-control':'no-cache'}});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw last;
}

function localPathFromUrl(url) {
  const u = new URL(url);
  let pathname = decodeURIComponent(u.pathname);
  if (pathname.includes('#') || pathname.includes('..')) throw new Error(`Unsafe local asset path: ${pathname}`);
  return path.join(OUT, pathname.replace(/^\/+/, ''));
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
    try {
      await fs.access(localPath);
      console.log('Using local asset', u.pathname);
      continue;
    } catch (_) {}
    let response;
    try { response = await fetchResponse(assetUrl); }
    catch (error) {
      console.warn('WARN mirror failed', u.pathname, error.message);
      if (u.pathname.startsWith('/assets/') || u.pathname === '/site.webmanifest') throw new Error(`Critical asset mirror failed: ${u.pathname} ${error.message}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(localPath), {recursive:true});
    await fs.writeFile(localPath, buffer);
    console.log('Mirrored', u.pathname, `(${buffer.length} bytes)`);
    const contentType = response.headers.get('content-type') || '';
    const isText = /text\/(css|javascript|html)|application\/(javascript|json|manifest\+json)|\.css$|\.js$/i.test(contentType + u.pathname);
    if (isText) {
      const body = buffer.toString('utf8');
      for (const ref of extractRefs(body, contentType, assetUrl)) if (!seen.has(ref)) queue.push(ref);
    }
  }
}

function patchHeartbeat(html) {
  if (!html.includes('id="heartbeat-support"')) throw new Error('Heartbeat event missing from production source');
  const figure = `<figure class="heartbeat-support-poster"><img alt="MagicOffice 心跳應援活動主視覺，活動期間 2026 年 9 月 1 日至 9 月 15 日" decoding="async" width="595" height="335" loading="eager" fetchpriority="high" src="${HEARTBEAT_PATH}?v=20260830-v5" style="display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:auto!important;object-fit:contain"/><figcaption>MagicOffice／魔幻 · 心跳應援</figcaption></figure>`;
  let output = html.replace(/<figure class="heartbeat-support-poster">[\s\S]*?<\/figure>/, figure);
  output = output.replace(/<meta name="x-magicoffice-heartbeat-release" content="[^"]*"\s*\/?>/, `<meta name="x-magicoffice-heartbeat-release" content="${BUILD_TAG}"/>`);
  if (!output.includes(`content="${BUILD_TAG}"`)) output = output.replace('</head>', `<meta name="x-magicoffice-heartbeat-release" content="${BUILD_TAG}"/>\n</head>`);
  return output;
}

async function main() {
  await fs.rm(OUT, {recursive:true, force:true});
  await fs.mkdir(path.join(OUT, 'assets', 'media'), {recursive:true});

  const sourceResponse = await fetchResponse(new URL(`?heartbeat-v5=${Date.now()}`, SOURCE).href);
  const sourceHtml = await sourceResponse.text();
  if (!sourceHtml.includes('MagicOffice') || !sourceHtml.includes('id="event-hub"')) throw new Error('Source baseline mismatch');
  const html = patchHeartbeat(sourceHtml);
  await fs.writeFile(path.join(OUT, 'index.html'), html, 'utf8');

  const imageResponse = await fetchResponse(IMAGE_SOURCE);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  if (imageBuffer.length < 10000) throw new Error(`Heartbeat image too small: ${imageBuffer.length}`);
  const imagePath = path.join(OUT, HEARTBEAT_PATH.replace(/^\/+/, ''));
  await fs.mkdir(path.dirname(imagePath), {recursive:true});
  await fs.writeFile(imagePath, imageBuffer);
  console.log('HEARTBEAT_V5_IMAGE_WRITTEN', imageBuffer.length, imageResponse.headers.get('content-type'));

  const seedUrls = extractRefs(html, 'text/html', SOURCE);
  await mirrorAssets(seedUrls);

  const marker = {build:BUILD_TAG, source:SOURCE, event:'heartbeat-support', imageDelivery:'same-origin-static-v5', imageBytes:imageBuffer.length, generatedAt:new Date().toISOString()};
  await fs.writeFile(path.join(OUT, 'heartbeat-build.json'), JSON.stringify(marker, null, 2));
  const final = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
  for (const must of ['id="heartbeat-support"','心跳應援','2026.09.01–09.15','訂位即送小卡一張','heartbeat-support-v5.png']) if (!final.includes(must)) throw new Error(`Final verification missing: ${must}`);
  console.log('MAGICOFFICE_HEARTBEAT_V5_BUILD_OK', BUILD_TAG, 'imageBytes', imageBuffer.length, 'assets', seedUrls.length);
}

main().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
