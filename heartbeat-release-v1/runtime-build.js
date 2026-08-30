const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');
const SOURCE = process.env.MAGICOFFICE_SOURCE || 'https://magicoffice.vercel.app/';
const SOURCE_ORIGIN = new URL(SOURCE).origin;
const BUILD_TAG = 'heartbeat-support-2026-08-30-v2';
const IMAGE_B64_URL = 'https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/new-domain-v1.0.4-menu-cms/heartbeat-release-v1/heartbeat-image.b64';

const HEARTBEAT_EVENT = {
  id: 'heartbeat-support',
  sectionId: 'heartbeat-support',
  title: '心跳應援',
  fullTitle: '心跳應援｜全力で応援するよ！！',
  start: '2026-09-01T00:00:00+08:00',
  end: '2026-09-15T23:59:59+08:00',
  displayDate: '2026.09.01–09.15',
  eyebrow: 'HEARTBEAT SUPPORT · 2026.09.01–09.15',
  statusSuffix: '',
  description: '9/1–9/15 心跳應援期間限定；九月整月活動，訂位即送小卡一張。'
};

const HEARTBEAT_CSS = String.raw`
<style id="magicoffice-heartbeat-event-css">
.heartbeat-support-section{position:relative;overflow:hidden;background:
  radial-gradient(circle at 16% 18%,rgba(255,132,185,.25),transparent 31%),
  radial-gradient(circle at 86% 70%,rgba(106,153,255,.13),transparent 30%),
  linear-gradient(135deg,#fff7fb 0%,#ffe2ef 48%,#fffafc 100%);color:#6e2448}
.heartbeat-support-section:before,.heartbeat-support-section:after{content:"♥";position:absolute;color:rgba(240,64,126,.10);font-size:18rem;line-height:1;pointer-events:none}
.heartbeat-support-section:before{top:-5rem;left:-3rem;transform:rotate(-12deg)}
.heartbeat-support-section:after{right:-2rem;bottom:-7rem;transform:rotate(12deg)}
.heartbeat-support-shell{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:88px 24px 92px}
.heartbeat-support-hero{display:grid;grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr);gap:52px;align-items:center}
.heartbeat-support-copy .eyebrow{color:#e73978;letter-spacing:.18em}
.heartbeat-support-copy h2{margin:.2em 0 .12em;font-size:clamp(3rem,7vw,6.8rem);line-height:.94;color:#ed3274;text-shadow:0 4px 0 #fff,0 8px 20px rgba(220,40,105,.18)}
.heartbeat-support-lead{margin:.8rem 0 .55rem;font-size:clamp(1.45rem,2.7vw,2.3rem);font-weight:800;color:#d82b68}
.heartbeat-support-intro{max-width:34rem;font-size:1.03rem;line-height:1.85;color:#7e4c63}
.heartbeat-support-poster{margin:0;border:1px solid rgba(236,63,125,.25);border-radius:36px;background:rgba(255,255,255,.70);box-shadow:0 24px 70px rgba(210,48,112,.20);padding:16px;backdrop-filter:blur(10px)}
.heartbeat-support-poster img{display:block;width:100%;height:auto;border-radius:26px}
.heartbeat-support-poster figcaption{text-align:center;padding:12px 8px 3px;font-size:.78rem;letter-spacing:.1em;color:#bd5a81}
.heartbeat-support-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:34px 0 26px}
.heartbeat-support-fact{padding:18px 20px;border-radius:22px;background:rgba(255,255,255,.78);border:1px solid rgba(237,50,116,.18);box-shadow:0 10px 30px rgba(218,49,107,.08)}
.heartbeat-support-fact small{display:block;margin-bottom:5px;color:#d43670;font-size:.72rem;letter-spacing:.14em}
.heartbeat-support-fact strong{display:block;color:#6e2448;font-size:1.08rem}
.heartbeat-support-fact span{display:block;margin-top:5px;color:#9a6078;font-size:.88rem}
.heartbeat-support-actions{display:flex;gap:12px;flex-wrap:wrap}
.heartbeat-support-actions .button.primary{background:linear-gradient(135deg,#f2397c,#d92d6b);border-color:#f2397c;color:#fff;box-shadow:0 12px 32px rgba(226,45,106,.24)}
.heartbeat-support-actions .button.ghost{border-color:rgba(218,45,105,.35);color:#b72c61;background:rgba(255,255,255,.68)}
.heartbeat-support-note{margin-top:20px;font-size:.85rem;color:#9a6078}
@media(max-width:820px){
  .heartbeat-support-shell{padding:68px 18px 72px}
  .heartbeat-support-hero{grid-template-columns:1fr;gap:30px}
  .heartbeat-support-copy{text-align:center}
  .heartbeat-support-intro{margin-left:auto;margin-right:auto}
  .heartbeat-support-poster{max-width:680px;margin:0 auto;padding:10px;border-radius:26px}
  .heartbeat-support-poster img{border-radius:20px}
  .heartbeat-support-facts{grid-template-columns:1fr}
  .heartbeat-support-actions{justify-content:center}
}
</style>`;

const HEARTBEAT_CARD = `<a aria-label="心跳應援，即將登場，2026.09.01–09.15" class="event-hub-card is-upcoming" data-event-id="heartbeat-support" data-event-status="upcoming" href="#heartbeat-support"><span class="event-card-status" data-event-card-status="">即將登場</span><strong>心跳應援</strong><time data-event-card-date="" datetime="2026-09-01T00:00:00+08:00">2026.09.01–09.15</time></a>`;

const HEARTBEAT_SECTION = `<section aria-labelledby="heartbeat-support-title" class="section heartbeat-support-section event-state-upcoming" data-event-end="2026-09-15T23:59:59+08:00" data-event-id="heartbeat-support" data-event-start="2026-09-01T00:00:00+08:00" data-event-status="upcoming" id="heartbeat-support">
<div class="heartbeat-support-shell">
  <div class="heartbeat-support-hero">
    <div class="heartbeat-support-copy">
      <span aria-live="polite" class="event-status-badge" data-event-status-label="" data-event-status-suffix="">即將登場</span>
      <p class="eyebrow">HEARTBEAT SUPPORT · 2026.09.01–09.15</p>
      <h2 id="heartbeat-support-title">心跳應援</h2>
      <p class="heartbeat-support-lead">全力で応援するよ！！</p>
      <p class="heartbeat-support-intro">9/1–9/15 期間限定應援主題。九月整月活動，完成訂位即送小卡一張；活動內容與異動以官網及官方公告為準。</p>
      <div class="heartbeat-support-facts" aria-label="心跳應援活動資訊">
        <div class="heartbeat-support-fact"><small>EVENT PERIOD</small><strong>2026.09.01–09.15</strong><span>心跳應援期間限定</span></div>
        <div class="heartbeat-support-fact"><small>SEPTEMBER GIFT</small><strong>訂位即送小卡一張</strong><span>九月整月活動</span></div>
      </div>
      <div class="heartbeat-support-actions">
        <a class="button primary" data-event-action="register" data-event-archive-label="活動已結束" data-event-id="heartbeat-support" data-event-live-href="https://gforms.app/r/71hSwQR" data-event-live-label="立即訂位" href="https://gforms.app/r/71hSwQR" rel="noopener noreferrer" target="_blank">立即訂位</a>
        <a class="button ghost" data-event-action="updates" data-event-archive-label="加入 LINE 接收最新活動" data-event-id="heartbeat-support" data-event-live-label="加入 LINE 接收活動更新" data-line-source="event-heartbeat-support-update" href="https://lin.ee/NcCGG1P" rel="noopener noreferrer" target="_blank">加入 LINE 接收活動更新</a>
      </div>
      <p class="heartbeat-support-note">九月活動贈禮依現場供應與官方最新公告為準。</p>
    </div>
    <figure class="heartbeat-support-poster"><img alt="MagicOffice 心跳應援活動主視覺，活動期間 2026 年 9 月 1 日至 9 月 15 日" decoding="async" height="720" loading="lazy" src="/assets/media/heartbeat-support.webp?v=20260830" width="1279"/><figcaption>MagicOffice／魔幻 · 心跳應援</figcaption></figure>
  </div>
</div>
</section>`;

function patchRegistry(html) {
  return html.replace(/<script id="magic-event-registry" type="application\/json">([\s\S]*?)<\/script>/, (whole, raw) => {
    try {
      const registry = JSON.parse(raw);
      registry.generatedAt = '2026-08-30T10:00:00+08:00';
      registry.events = Array.isArray(registry.events) ? registry.events : [];
      registry.events = registry.events.filter((event) => event && event.id !== HEARTBEAT_EVENT.id);
      registry.events.unshift(HEARTBEAT_EVENT);
      return `<script id="magic-event-registry" type="application/json">${JSON.stringify(registry)}</script>`;
    } catch (error) {
      throw new Error(`Unable to patch event registry: ${error.message}`);
    }
  });
}

function patchStructuredData(html) {
  return html.replace(/<script id="magic-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/, (whole, raw) => {
    try {
      const data = JSON.parse(raw);
      const graph = Array.isArray(data['@graph']) ? data['@graph'] : [];
      const filtered = graph.filter((item) => item && item['@id'] !== '#event-heartbeat-support');
      filtered.push({
        '@type': 'Event', '@id': '#event-heartbeat-support',
        name: '心跳應援｜全力で応援するよ！！',
        description: '9/1–9/15 心跳應援期間限定；九月整月活動，訂位即送小卡一張。',
        startDate: '2026-09-01T00:00:00+08:00', endDate: '2026-09-15T23:59:59+08:00',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {'@id':'#magicoffice-place'}, organizer: {'@id':'#magicoffice'}
      });
      data['@graph'] = filtered;
      return `<script id="magic-structured-data" type="application/ld+json">${JSON.stringify(data)}</script>`;
    } catch (error) {
      throw new Error(`Unable to patch structured data: ${error.message}`);
    }
  });
}

function patchHtml(sourceHtml) {
  let html = sourceHtml;
  if (!html.includes('id="heartbeat-support"')) {
    html = patchRegistry(html);
    html = patchStructuredData(html);
    html = html.replace('</head>', `${HEARTBEAT_CSS}\n<meta name="x-magicoffice-heartbeat-release" content="${BUILD_TAG}"/>\n</head>`);
    html = html.replace('<div class="event-hub-grid">', `<div class="event-hub-grid">${HEARTBEAT_CARD}`);
    html = html.replace('<b data-event-count="upcoming">2</b>', '<b data-event-count="upcoming">3</b>');
    html = html.replace('下一場：中秋月宴｜2026.09.05', '下一場：心跳應援｜2026.09.01–09.15');
    const insertionPoint = '<section class="section summer-navy-section';
    const index = html.indexOf(insertionPoint);
    if (index === -1) throw new Error('Could not find summer-navy insertion point');
    html = html.slice(0, index) + HEARTBEAT_SECTION + '\n' + html.slice(index);
    html = html.replace('<a href="#schedule">本週出勤｜官網正式版</a>', '<a href="#schedule">本週出勤｜官網正式版</a><a href="#heartbeat-support">心跳應援</a>');
    html = html.replace('中秋月宴、柚子 9/19 生誕', '心跳應援、中秋月宴、柚子 9/19 生誕');
    html = html.replace('<html ', '<html data-heartbeat-release="2026-09" ');
  }
  return html;
}

function isSkippable(raw) {
  if (!raw) return true;
  const value = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) return true;
  if (/%23/i.test(value)) return true;
  return false;
}

function extractRefs(text, contentType, parentUrl) {
  const refs = new Set();
  const add = (raw) => {
    if (!raw || isSkippable(raw)) return;
    let clean = raw.trim().replace(/^['"]|['"]$/g, '').replace(/&amp;/g, '&');
    if (!clean || clean.startsWith('#')) return;
    try {
      const u = new URL(clean, parentUrl);
      if (u.origin !== SOURCE_ORIGIN) return;
      if (u.hash && clean.startsWith('#')) return;
      if (/%23/i.test(u.pathname)) return;
      if (!(u.pathname.startsWith('/assets/') || u.pathname === '/site.webmanifest')) return;
      refs.add(u.href);
    } catch (_) {}
  };

  if (/html/i.test(contentType)) {
    const attr = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    for (const match of text.matchAll(attr)) add(match[1]);
    const srcset = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
    for (const match of text.matchAll(srcset)) {
      for (const part of match[1].split(',')) add(part.trim().split(/\s+/)[0]);
    }
  }

  const cssUrl = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  for (const match of text.matchAll(cssUrl)) add(match[1]);

  const absoluteLocal = /["'`](\/(?:assets\/|site\.webmanifest)[^"'`\s)<>]*)["'`]/gi;
  for (const match of text.matchAll(absoluteLocal)) add(match[1]);

  return [...refs];
}

async function fetchResponse(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {headers:{'user-agent':'MagicOffice-heartbeat-production-builder/1.0','cache-control':'no-cache'}});
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
    try {
      await fs.access(localPath);
      console.log('Using local asset', u.pathname);
      continue;
    } catch (_) {}

    let response;
    try {
      response = await fetchResponse(assetUrl);
    } catch (error) {
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
      const text = buffer.toString('utf8');
      for (const ref of extractRefs(text, contentType, assetUrl)) {
        if (!seen.has(ref)) queue.push(ref);
      }
    }
  }
}

async function main() {
  await fs.rm(OUT, {recursive:true, force:true});
  await fs.mkdir(path.join(OUT, 'assets', 'media'), {recursive:true});

  const rootUrl = new URL(`?heartbeat-build=${Date.now()}`, SOURCE).href;
  const response = await fetchResponse(rootUrl);
  const sourceHtml = await response.text();
  if (!sourceHtml.includes('MagicOffice') || !sourceHtml.includes('id="event-hub"')) throw new Error('Source baseline mismatch');

  const html = patchHtml(sourceHtml);
  await fs.writeFile(path.join(OUT, 'index.html'), html, 'utf8');

  const imageResponse = await fetchResponse(IMAGE_B64_URL);
  const imageB64 = (await imageResponse.text()).replace(/\s+/g, '');
  await fs.writeFile(path.join(OUT, 'assets', 'media', 'heartbeat-support.webp'), Buffer.from(imageB64, 'base64'));

  const seedUrls = extractRefs(html, 'text/html', SOURCE);
  await mirrorAssets(seedUrls);

  const marker = {build:BUILD_TAG, source:SOURCE, event:'heartbeat-support', generatedAt:new Date().toISOString()};
  await fs.writeFile(path.join(OUT, 'heartbeat-build.json'), JSON.stringify(marker, null, 2));

  const final = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
  for (const must of ['id="heartbeat-support"','心跳應援','2026.09.01–09.15','訂位即送小卡一張','/assets/media/heartbeat-support.webp']) {
    if (!final.includes(must)) throw new Error(`Final verification missing: ${must}`);
  }
  console.log('MAGICOFFICE_HEARTBEAT_BUILD_OK', BUILD_TAG, 'assets', seedUrls.length);
}

main().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
