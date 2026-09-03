import fs from 'node:fs';
import '../assets/js/menu-view.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
const ASSETS = path.join(ROOT, 'assets');
const DIST = path.join(ROOT, 'dist');
const CANONICAL = 'https://magicoffice.vercel.app/';

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(CONTENT, name), 'utf8'));
const site = readJson('site.json');
const roster = readJson('roster.json');
const schedule = readJson('schedule-fallback.json');
const menu = readJson('menu-fallback.json');
const eventRegistry = readJson('events.json');

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function jsonForHtml(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function taipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: site.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return parts;
}

function isoDateInTaipei(date = new Date()) {
  const p = taipeiParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function mondayOf(dateString) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  const day = Number(new Intl.DateTimeFormat('en-US', { timeZone: site.timezone, weekday: 'short' })
    .formatToParts(date).find((part) => part.type === 'weekday')?.value
    ? date.getUTCDay() : date.getUTCDay());
  const localDay = Number(new Intl.DateTimeFormat('en-US', { timeZone: site.timezone, weekday: 'short' })
    .format(date) === 'Sun' ? 0 : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: site.timezone, weekday: 'short' }).format(date)));
  const delta = localDay === 0 ? -6 : 1 - localDay;
  date.setUTCDate(date.getUTCDate() + delta);
  return isoDateInTaipei(date);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDateInTaipei(date);
}

function dateLabel(dateString) {
  const d = new Date(`${dateString}T12:00:00+08:00`);
  return new Intl.DateTimeFormat('zh-TW', { timeZone: site.timezone, month: '2-digit', day: '2-digit' }).format(d);
}

function weekdayLabel(dateString) {
  const d = new Date(`${dateString}T12:00:00+08:00`);
  return new Intl.DateTimeFormat('zh-TW', { timeZone: site.timezone, weekday: 'short' }).format(d);
}

function renderRoster() {
  const cards = roster.filter((item) => item.active !== false).sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999)).map((item) => `
    <button class="mo-cast-card" type="button" data-profile-id="${esc(item.id)}" data-role="${esc(item.role)}" aria-label="查看 ${esc(item.cardName || item.name)} 人物資料" aria-haspopup="dialog" aria-controls="profile-dialog">
      <span class="mo-cast-photo"><img src="${esc(item.image)}" alt="${esc(item.cardName || item.name)} 正式人物卡" loading="lazy" decoding="async"/></span>
      <span class="mo-cast-copy"><small>${esc(item.role)}</small><strong>${esc(item.cardName || item.name)}</strong><em>${esc(item.hours || '請查看本週出勤')}</em></span>
    </button>`).join('');

  return `<section class="mo-section mo-section--night mo-roster-section" id="roster">
  <div class="mo-shell">
    <div class="mo-heading"><p class="mo-eyebrow">ASHI ROSTER</p><h2>姶仕名錄</h2><p>點選人物卡，認識姶仕的個性、喜好與出沒時段。</p></div>
    <div class="mo-filter-row" role="group" aria-label="人物分類"><button class="is-active" type="button" data-roster-filter="全部">全部</button><button type="button" data-roster-filter="管理職">管理職</button><button type="button" data-roster-filter="姶仕">姶仕</button></div>
    <div class="mo-cast-grid" data-roster-grid>${cards}</div>
  </div>
</section>`;
}

function scheduleRowsForWeek(rows, start) {
  const end = addDays(start, 6);
  return rows.filter((row) => row.date >= start && row.date <= end);
}

function renderScheduleCards(rows, startDate, currentDate = isoDateInTaipei()) {
  const byDate = new Map();
  for (let i = 0; i < 7; i += 1) byDate.set(addDays(startDate, i), []);
  for (const row of rows) if (byDate.has(row.date)) byDate.get(row.date).push(row);
  return [...byDate.entries()].map(([date, entries]) => {
    entries.sort((a, b) => Number(a.sort || 999) - Number(b.sort || 999));
    const tags = [...new Set(entries.flatMap((row) => [row.costume, row.event]).filter(Boolean))];
    const closed = entries.some((row) => row.event === '公休' || row.shift === '公休');
    const list = closed
      ? '<li class="is-empty"><strong>公休</strong><time>當日不營業</time></li>'
      : entries.length
        ? entries.map((row) => `<li><strong>${esc(row.name || row.event || '未公告')}</strong><time>${esc(row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : row.shift || '時間未定')}</time></li>`).join('')
        : '<li class="is-empty"><strong>尚未公告</strong><time>請留意官網更新</time></li>';
    return `<article class="mo-day-card${date === currentDate ? ' is-today' : ''}" data-schedule-date="${date}"><header><small>${esc(weekdayLabel(date))}</small><strong>${esc(dateLabel(date))}</strong><span>${date === currentDate ? 'TODAY' : '&nbsp;'}</span></header><div class="mo-day-tags">${tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div><ul>${list}</ul></article>`;
  }).join('');
}

function renderSchedule() {
  const current = isoDateInTaipei();
  const start = mondayOf(current);
  const rows = scheduleRowsForWeek(schedule.rows, start);
  const generated = schedule.generatedAt ? schedule.generatedAt.replace('T', ' ').replace('+08:00', '') : '未標示';
  return `<section class="mo-section mo-section--paper mo-schedule-section" id="schedule" data-schedule-section data-week-start="${start}">
  <div class="mo-shell">
    <div class="mo-heading"><p class="mo-eyebrow">WEEKLY ATTENDANCE</p><h2>本週出勤</h2><p>來店前，看看這一週會遇見誰。</p></div>
    <div class="mo-week-grid" data-schedule-grid>${renderScheduleCards(rows, start, current)}</div>
    <p class="mo-menu-sync-note">出勤如有臨時異動，以官網與官方 LINE 最新公告為準。</p>
  </div>
</section>`;
}

function renderLineMember() {
  return `<section class="mo-section mo-section--sakura mo-line-section" id="line-member">
  <div class="mo-shell mo-line-grid">
    <div><div class="mo-heading"><p class="mo-eyebrow">MEMBER &amp; SUPPORT</p><h2>加入 MagicOffice<br/>LINE 官方</h2><p>訂位表單仍由官網直接完成；LINE 承接集點、訂位異動、退款申請、客服與重要活動提醒。</p></div>
      <ul class="mo-line-features"><li><strong>集點與回訪</strong><span>開啟集點卡，保留每次來店紀錄。</span></li><li><strong>活動與會員通知</strong><span>接收重要活動更新與會員提醒。</span></li><li><strong>訂位異動與客服</strong><span>取消、修改或需要協助時，由 LINE 留下正式紀錄。</span></li></ul>
    </div>
    <div class="mo-line-actions"><a class="mo-btn mo-btn--gold" href="${esc(site.links.line)}" rel="noopener" target="_blank">加入 LINE 開啟集點卡</a><a class="mo-btn mo-btn--ghost" href="#schedule">查看本週出勤</a><small>出勤、價目與活動規則仍以官網最新內容為準。</small></div>
  </div>
</section>`;
}

function eventStatus(event, now = Date.now()) {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (Number.isFinite(start) && now < start) return 'upcoming';
  if (Number.isFinite(end) && now > end) return 'archive';
  return 'live';
}

function statusLabel(status) {
  return status === 'live' ? '活動進行中' : status === 'upcoming' ? '即將登場' : '活動回顧';
}

function renderBlock(block) {
  if (block.type === 'list') return `<ul class="mo-detail-list">${(block.items || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
  if (block.type === 'timeline') return `<ol class="mo-timeline">${(block.items || []).map((item) => `<li><time>${esc(item.time)}</time><div><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></div></li>`).join('')}</ol>`;
  if (block.type === 'notice') return `<div class="mo-notice"><strong>${esc(block.title)}</strong><p>${esc(block.text)}</p></div>`;
  if (block.type === 'image') return `<img class="mo-detail-image" src="${esc(block.image)}" alt="${esc(block.alt || '')}" loading="lazy" decoding="async"/>`;
  if (block.type === 'gallery') return `<div class="mo-gallery">${(block.items || []).map((item) => `<figure><img src="${esc(item.image)}" alt="${esc(item.caption || '')}" loading="lazy" decoding="async"/><figcaption>${esc(item.caption || '')}</figcaption></figure>`).join('')}</div>`;
  if (block.type === 'rewards') return `<div class="mo-rewards">${(block.items || []).map((item) => `<article class="mo-reward">${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" decoding="async"/>` : '<div class="mo-reward-symbol" aria-hidden="true">✦</div>'}<div><div class="mo-reward-level">${esc(item.level)}</div><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p></div></article>`).join('')}</div>`;
  return '';
}

function renderAccordion(accordion, index) {
  const notices = (accordion.blocks || []).filter((block) => block.type === 'notice');
  const regular = (accordion.blocks || []).filter((block) => block.type !== 'notice').map(renderBlock).join('');
  const noticesHtml = notices.length ? `<div class="mo-notice-grid">${notices.map(renderBlock).join('')}</div>` : '';
  return `<details class="mo-accordion"${index === 0 ? ' open' : ''}><summary><span>${esc(accordion.title)}</span><small>${esc(accordion.meta || '展開查看')}</small></summary><div class="mo-accordion-body">${regular}${noticesHtml}</div></details>`;
}

function renderEventCard(event, status) {
  const visual = event.poster ? `<img src="${esc(event.poster)}" alt="" loading="lazy" decoding="async"/>` : '';
  const suffix = event.statusSuffix ? ` · ${event.statusSuffix}` : '';
  return `<a class="mo-event-card is-${status}" data-event-id="${esc(event.id)}" data-event-status="${status}" href="#${esc(event.anchor)}">${visual}<span class="mo-event-card-copy"><span class="mo-badge" data-event-card-status>${statusLabel(status)}${esc(suffix)}</span><h3>${esc(event.title)}</h3><time>${esc(event.displayDate)}</time></span></a>`;
}

function renderEventDetail(event, status) {
  const poster = event.poster ? `<figure class="mo-event-poster"><img src="${esc(event.poster)}" alt="${esc(event.posterAlt || event.title)}" loading="lazy" decoding="async"/></figure>` : '';
  const actions = event.actions || {};
  const actionHtml = [
    actions.registerUrl ? `<a class="mo-btn mo-btn--gold" data-event-action="register" data-event-live-label="${esc(actions.registerLabel)}" data-event-live-href="${esc(actions.registerUrl)}" data-event-archive-label="活動已結束" href="${status === 'archive' ? '#events' : esc(actions.registerUrl)}" ${status === 'archive' ? '' : 'rel="noopener" target="_blank"'}>${status === 'archive' ? '活動已結束' : esc(actions.registerLabel)}</a>` : '',
    actions.secondaryUrl ? `<a class="mo-btn mo-btn--ghost" data-event-action="secondary" href="${esc(actions.secondaryUrl)}" rel="noopener" target="_blank">${esc(actions.secondaryLabel)}</a>` : '',
    actions.updateUrl ? `<a class="mo-btn mo-btn--ghost" href="${esc(actions.updateUrl)}" rel="noopener" target="_blank">${esc(actions.updateLabel)}</a>` : '',
  ].join('');
  const facts = (event.facts || []).map((fact) => `<div class="mo-fact"><small>${esc(fact.label)}</small><strong>${esc(fact.value)}</strong><span>${esc(fact.note || '')}</span></div>`).join('');
  const features = (event.featureCards || []).length ? `<div class="mo-feature-grid">${event.featureCards.map((item) => `<article class="mo-feature-card"><span class="index">${esc(item.index)}</span><p class="mo-eyebrow">${esc(item.eyebrow)}</p><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join('')}</div>` : '';
  const accordions = (event.accordions || []).length ? `<div class="mo-accordion-list">${event.accordions.map(renderAccordion).join('')}</div>` : '';
  return `<section class="mo-section mo-event-detail" id="${esc(event.anchor)}" data-event-detail data-event-id="${esc(event.id)}" data-event-start="${esc(event.start)}" data-event-end="${esc(event.end)}">
  <div class="mo-shell">
    <div class="mo-event-hero-grid${poster ? '' : ' no-poster'}">
      <div class="mo-event-copy"><span class="mo-badge" data-event-status-label>${statusLabel(status)}${event.statusSuffix ? ` · ${esc(event.statusSuffix)}` : ''}</span><p class="mo-eyebrow">${esc(event.eyebrow)}</p><h2><span class="mo-event-title-main">${esc(event.title)}</span>${event.subtitle ? `<small>${esc(event.subtitle)}</small>` : ''}</h2><p class="mo-event-lead">${esc(event.lead || '')}</p><p class="mo-event-summary">${esc(event.summary || '')}</p><div class="mo-event-actions">${actionHtml}</div></div>${poster}
    </div>
    ${facts ? `<div class="mo-facts">${facts}</div>` : ''}${features}${accordions}${event.closingNote ? `<p class="mo-event-closing">${esc(event.closingNote)}</p>` : ''}
  </div>
</section>`;
}

function renderEvents() {
  const events = eventRegistry.events.filter(event => event.active !== false && eventStatus(event) !== 'archive');
  const now = Date.now();
  const ordered = [...events].sort((a, b) => {
    const statusRank = { live: 0, upcoming: 1, archive: 2 };
    const sa = eventStatus(a, now); const sb = eventStatus(b, now);
    if (statusRank[sa] !== statusRank[sb]) return statusRank[sa] - statusRank[sb];
    return sa === 'archive' ? Date.parse(b.end) - Date.parse(a.end) : Date.parse(a.start) - Date.parse(b.start);
  });
  const counts = ordered.reduce((acc, event) => { acc[eventStatus(event, now)] += 1; return acc; }, { live: 0, upcoming: 0, archive: 0 });
  const next = ordered.find((event) => eventStatus(event, now) !== 'archive');
  const cards = ordered.map((event) => renderEventCard(event, eventStatus(event, now))).join('');
  const details = ordered.map((event) => renderEventDetail(event, eventStatus(event, now))).join('');
  return `<section class="mo-section mo-section--sakura mo-event-hub-section" id="events" data-event-hub>
  <div class="mo-shell"><div class="mo-heading"><p class="mo-eyebrow">EVENT UPDATE</p><h2>活動快報</h2><p>日期、規則與異動以官網各活動區塊最新內容為準；狀態會依台北時間自動切換。</p></div>
    <div class="mo-event-statusbar"><span class="mo-event-count"><b data-event-count="live">${counts.live}</b> 進行中</span><span class="mo-event-count"><b data-event-count="upcoming">${counts.upcoming}</b> 即將登場</span><span class="mo-event-count"><b data-event-count="archive">${counts.archive}</b> 活動回顧</span><span class="mo-event-next" data-event-next>${next ? `下一場：${esc(next.title)}｜${esc(next.displayDate)}` : '目前沒有即將登場的活動'}</span><small class="mo-event-clock">依台北時間自動更新・<time data-event-clock>${esc(isoDateInTaipei())}</time></small></div>
    <div class="mo-event-grid" data-event-grid>${cards}</div>
  </div>
</section>${details}`;
}

function renderMenu() {
  return `<section class="mo-section mo-section--paper mo-menu-section" id="menu" data-menu-section data-active-menu-world="CAFE">
  <div class="mo-shell"><div class="mo-heading"><p class="mo-eyebrow">SERVICE &amp; MENU</p><h2>午後咖啡與魔幻夜晚</h2><p>選擇來店時段，即可查看餐飲、浮世繪與周邊的完整價目。</p></div>
    <div class="mo-menu-tabs" role="tablist" aria-label="菜單時段">${globalThis.MOMenuView.renderTabs(menu)}</div>
    <div data-menu-panes>${globalThis.MOMenuView.renderPanes(menu)}</div>
    <div class="mo-purchase-callout"><div><strong>線上購拍</strong><p>購買完成後不得取消，請於送出前確認品項與資料。</p></div><button class="mo-btn mo-btn--gold" type="button" data-open-purchase>前往線上購拍</button></div>
  </div></section>`;
}

function renderRecruitment() {
  return `<section class="mo-section mo-section--sakura mo-recruit-section" id="recruitment"><div class="mo-shell"><div class="mo-recruit-grid"><div><p class="mo-eyebrow">JOIN MAGICOFFICE</p><h2>成為魔幻的一員</h2><p>想加入 MagicOffice／魔幻團隊，請由招募表單提供基本資料。招募條件與後續安排，以表單與官方聯繫為準。</p></div><a class="mo-btn mo-btn--gold" href="${esc(site.links.recruitment)}" rel="noopener" target="_blank">填寫招募表單</a></div></div></section>`;
}

function buildJsonLd() {
  const graph = [
    {
      '@type': 'LocalBusiness', '@id': `${CANONICAL}#magicoffice`, name: site.brandName,
      alternateName: site.legalName, url: CANONICAL, image: `${CANONICAL}assets/images/og-card.webp`,
      address: { '@type': 'PostalAddress', streetAddress: '八德路二段375號', addressLocality: '松山區', addressRegion: '台北市', addressCountry: 'TW' },
      sameAs: [site.links.instagram],
    },
    ...eventRegistry.events.filter(event => event.active !== false && eventStatus(event) !== 'archive').map((event) => ({
      '@type': 'Event', '@id': `${CANONICAL}#event-${event.id}`, name: `${event.title}${event.subtitle ? `｜${event.subtitle}` : ''}`,
      description: event.summary, startDate: event.start, endDate: event.end,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: eventStatus(event) === 'archive' ? 'https://schema.org/EventCompleted' : 'https://schema.org/EventScheduled',
      location: { '@type': 'Place', name: 'MagicOffice／魔幻 × 魔窟 DIABLOSLAIR', address: site.address },
      organizer: { '@id': `${CANONICAL}#magicoffice` },
      image: event.poster ? `${CANONICAL}${event.poster}` : `${CANONICAL}assets/images/og-card.webp`,
    })),
  ];
  return `<script type="application/ld+json">${jsonForHtml({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

function injectFallbackData(html) {
  const dataScripts = [
    ['mo-site-data', site], ['mo-roster-data', roster], ['mo-schedule-fallback', schedule],
    ['mo-menu-fallback', menu], ['mo-events-data', eventRegistry],
  ].map(([id, data]) => `<script id="${id}" type="application/json">${jsonForHtml(data)}</script>`).join('\n');
  return html.replace('</body>', `${dataScripts}\n</body>`);
}

function writeStaticFiles(version) {
  const manifest = {
    name: 'MagicOffice／魔幻', short_name: 'MagicOffice', start_url: '/', display: 'standalone',
    background_color: '#070507', theme_color: '#090507', lang: 'zh-Hant',
    icons: [
      { src: '/assets/images/logo/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { src: '/assets/images/logo/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
  fs.writeFileSync(path.join(DIST, 'site.webmanifest'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${CANONICAL}sitemap.xml\n`);
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${CANONICAL}</loc><lastmod>${isoDateInTaipei()}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`);
  fs.writeFileSync(path.join(DIST, '404.html'), `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>找不到頁面｜MagicOffice</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070507;color:#f7f1e8;font-family:system-ui}.box{text-align:center;padding:32px}a{color:#d8b56b}</style><div class="box"><h1>這一頁暫時不在魔幻裡</h1><p><a href="/">返回首頁</a></p></div></html>`);
  const headers = {
    version: 2,
    headers: [
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/content/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' }] },
      { source: '/(.*)', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ] },
    ],
    rewrites: [{ source: '/api/schedule', destination: '/api/schedule' }, { source: '/api/menu', destination: '/api/menu' }],
  };
  // vercel.json is maintained as source configuration; the build must not overwrite it.
  fs.writeFileSync(path.join(DIST, 'BUILD_VERSION.txt'), `${version}\n`);
}

function main() {
  const version = `${site.version}-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  copyDir(ASSETS, path.join(DIST, 'assets'));
  copyDir(CONTENT, path.join(DIST, 'content'));

  let html = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');
const heroVideo = String(site.hero?.video || '');
const heroFilename = String(site.hero?.filename || path.basename(heroVideo));
if (!heroVideo || !heroFilename) throw new Error('content/site.json hero.video and hero.filename are required');
html = html.replaceAll('{{HERO_VIDEO}}', esc(heroVideo)).replaceAll('{{HERO_FILENAME}}', esc(heroFilename));
  html = html
    .replaceAll('{{BUILD_VERSION}}', version)
    .replace('<!--SEO_JSONLD-->', buildJsonLd())
    .replace('<!--ROSTER_SECTION-->', renderRoster())
    .replace('<!--SCHEDULE_SECTION-->', renderSchedule())
    .replace('<!--LINE_MEMBER_SECTION-->', renderLineMember())
    .replace('<!--EVENT_SECTIONS-->', renderEvents())
    .replace('<!--MENU_SECTION-->', renderMenu())
    .replace('<!--RECRUITMENT_SECTION-->', renderRecruitment())
    .replace('Production Ready v4.3 Design Locked Preview', `Production Ready v4.3 Design Locked Preview · ${version}`)
    .replace('data-build="MagicOffice-production-ready-v4.3-design-locked"', `data-build="${version}"`);
  html = injectFallbackData(html);

  const leftovers = [...html.matchAll(/<!--(?:ROSTER|SCHEDULE|LINE_MEMBER|EVENT|MENU|RECRUITMENT|SEO)_/g)];
  if (leftovers.length) throw new Error(`Unreplaced markers: ${leftovers.map((m) => m[0]).join(', ')}`);
  for (const token of ['data-roster-grid', 'data-schedule-grid', 'data-event-grid', 'data-menu-panes', 'mo-site-data', 'mo-events-data']) {
    if (!html.includes(token)) throw new Error(`Missing output token: ${token}`);
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
  writeStaticFiles(version);

  const inventory = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const data = fs.readFileSync(file);
        inventory.push({ path: path.relative(DIST, file).replaceAll('\\', '/'), bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
      }
    }
  };
  walk(DIST);
  const report = {
    release: version, generatedAt: new Date().toISOString(), canonical: CANONICAL,
    rosterCount: roster.filter((x) => x.active !== false).length,
    scheduleFallbackRows: schedule.rows.length, menuWorlds: menu.worlds.length,
    menuItems: menu.worlds.reduce((n, w) => n + (w.groups || []).reduce((m, g) => m + (g.items || []).filter((i) => i.status !== '隱藏').length, 0), 0),
    eventCount: eventRegistry.events.length, files: inventory,
  };
  fs.writeFileSync(path.join(DIST, 'build-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
