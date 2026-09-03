import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CONTENT = path.join(ROOT, 'content');
const errors = [];
const warnings = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

for (const file of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest', 'BUILD_VERSION.txt']) {
  assert(fs.existsSync(path.join(DIST, file)), `缺少 dist/${file}`);
}

const htmlPath = path.join(DIST, 'index.html');
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
const site = readJson(path.join(CONTENT, 'site.json'));
const roster = readJson(path.join(CONTENT, 'roster.json'));
const events = readJson(path.join(CONTENT, 'events.json'));
const menu = readJson(path.join(CONTENT, 'menu-fallback.json'));
const schedule = readJson(path.join(CONTENT, 'schedule-fallback.json'));

assert(Array.isArray(roster) && roster.filter((item) => item.active !== false).length === 16, '姶仕名錄必須有 16 位啟用成員');
const rosterIds = roster.map((item) => item.id);
assert(new Set(rosterIds).size === rosterIds.length, '姶仕 ID 不可重複');
for (const member of roster) {
  assert(member.id && member.name && member.role && member.image, `姶仕資料不完整：${member.id || member.name || 'unknown'}`);
  const image = path.join(ROOT, member.image || '');
  assert(fs.existsSync(image), `姶仕圖片不存在：${member.image}`);
}

assert(Array.isArray(events.events) && events.events.length === 3, '活動資料必須保留 3 筆有效活動');
const eventIds = events.events.map((event) => event.id);
assert(!eventIds.includes('summer-navy') && !eventIds.includes('jubi-birthday'), '過期活動不得留在正式活動資料');
assert(new Set(eventIds).size === eventIds.length, '活動 ID 不可重複');
for (const event of events.events) {
  assert(event.id && event.anchor && event.title && event.start && event.end, `活動資料不完整：${event.id || event.title || 'unknown'}`);
  assert(Number.isFinite(Date.parse(event.start)) && Number.isFinite(Date.parse(event.end)), `活動日期格式錯誤：${event.id}`);
  assert(Date.parse(event.start) <= Date.parse(event.end), `活動結束時間早於開始時間：${event.id}`);
  if (event.poster) assert(fs.existsSync(path.join(ROOT, event.poster)), `活動主視覺不存在：${event.poster}`);
  for (const accordion of event.accordions || []) for (const block of accordion.blocks || []) {
    if (block.image) assert(fs.existsSync(path.join(ROOT, block.image)), `活動圖片不存在：${block.image}`);
    for (const item of block.items || []) if (item?.image) assert(fs.existsSync(path.join(ROOT, item.image)), `活動圖片不存在：${item.image}`);
  }
}

const menuItems = [];
for (const world of menu.worlds || []) {
  assert(world.code && world.key && world.tab && world.image, `菜單世界資料不完整：${world.code || world.key || 'unknown'}`);
  assert(fs.existsSync(path.join(ROOT, world.image || '')), `菜單場景圖不存在：${world.image}`);
  for (const group of world.groups || []) {
    assert(group.id && group.title, `菜單分類資料不完整：${group.id || group.title || 'unknown'}`);
    for (const item of group.items || []) {
      menuItems.push(item);
      assert(item.id && item.name && item.price, `菜單品項資料不完整：${item.id || item.name || 'unknown'}`);
    }
  }
}
assert((menu.worlds || []).length === 3, '菜單必須保留 3 個世界');
assert(menuItems.length >= 88, `可用菜單品項不足：${menuItems.length}`);
assert(new Set(menuItems.map((item) => item.id)).size === menuItems.length, '菜單品項 ID 不可重複');

assert(Array.isArray(schedule.rows) && schedule.rows.length > 0, '班表備援快照不可為空');
for (const row of schedule.rows) assert(/^\d{4}-\d{2}-\d{2}$/.test(row.date || ''), `班表日期格式錯誤：${row.date}`);

for (const token of [
  'data-build=', 'data-roster-grid', 'data-schedule-grid', 'data-event-grid', 'data-event-detail',
  'data-menu-panes', 'mo-mobile-bar', 'mo-site-data', 'mo-events-data',
  site.hero.video, 'MAGICOFFICE', 'application/ld+json', 'data-video-sound', 'data-video-start',
]) assert(html.includes(token), `首頁缺少必要標記：${token}`);
assert(!/\{\{[^}]+\}\}|<!--(?:ROSTER|SCHEDULE|LINE_MEMBER|EVENT|MENU|RECRUITMENT|SEO)_/.test(html), '首頁仍有未替換的建置標記');
assert((html.match(/class="mo-cast-card"/g) || []).length === 16, '首頁預渲染人物卡數量不是 16');
assert((html.match(/class="mo-day-card/g) || []).length === 7, '首頁預渲染班表卡數量不是 7');
assert((html.match(/data-event-status="(?:live|upcoming|archive)"/g) || []).length === 3, '首頁活動快報卡片數量不是 3');
assert((html.match(/\sdata-event-detail(?:\s|>)/g) || []).length === 3, '首頁完整活動區塊數量不是 3');
assert((html.match(/data-menu-item-id=/g) || []).length >= 88, '首頁預渲染菜單品項少於 88');

const localReferences = new Set();
for (const match of html.matchAll(/(?:src|href|poster)=["']([^"']+)["']/gi)) {
  const value = match[1].split('#')[0].split('?')[0];
  if (!value || /^(?:https?:|mailto:|tel:|data:|blob:|#|\/)/i.test(value)) continue;
  localReferences.add(value);
}
for (const value of localReferences) {
  const target = path.join(DIST, value);
  assert(fs.existsSync(target), `首頁引用的本機檔案不存在：${value}`);
}

const eventPosters = events.events.map((event) => event.poster).filter(Boolean);
assert(eventPosters.length === events.events.length, '活動圖必須完整核對後才能發布');
const heartbeat = events.events.find(e=>e.id==='heartbeat-support');
assert(heartbeat?.assetReview?.status==='verified-exact-original', '心跳應援不得使用未核對的替代圖');
assert(heartbeat?.poster && crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,heartbeat.poster))).digest('hex') === '228cfbf667e636dc95bb3b3195f8c9d43e168c573e6e10b463b306dfbfb1f6e3', '心跳應援與原官網檔案不符');
assert(new Set(eventPosters).size === eventPosters.length, '活動主視覺路徑不可重複');
assert(html.includes('data-menu-world="CAFE"') && html.includes('data-menu-world="BAR"') && html.includes('data-collection-period="CAFE"') && html.includes('data-collection-period="BAR"'), '日夜兩頁與各自收藏品項未完整輸出');
for (const pattern of ['wave.svg', 'snow.svg', 'sakura.svg']) assert(fs.existsSync(path.join(ROOT, 'assets/images/patterns', pattern)), `菜單風格圖樣不存在：${pattern}`);
assert(html.includes('<span class="mo-title-lock">魔幻姶仕社</span>'), '首頁中文標題未鎖定完整排列');
assert(!html.includes('data-schedule-refresh') && !html.includes('data-menu-refresh') && !html.includes('mo-media-console') && !html.includes('data-menu-group-filter'), '顧客介面不應保留刷新與多層篩選或額外影片控制格');
assert((html.match(/ role="tab" data-menu-tab=/g)||[]).length === 2, '菜單應為日夜兩頁');
assert((html.match(/data-collection-period=/g)||[]).length === 2, '收藏品項應依時段合併');
assert((html.match(/class=\"mo-overview-intro\"/g) || []).length === 1, '品牌故事與三種狀態必須合併為單一總覽');
assert((html.match(/<section[^>]*id=\"worlds\"/g) || []).length === 1 && !html.includes('<section class=\"mo-section mo-section--paper\" id=\"brand-origin\">'), '第二、第三區仍被拆成兩個獨立頁面');
assert(html.includes('id=\"brand-origin\"') && html.includes('mo-world-grid--overview'), '合併總覽缺少相容錨點或三種狀態卡片');

assert(site.schedule?.spreadsheetId === '15y3DL7_nUj5JLng9mKayhwDnAnZPQgPHg0zCrLdb0BQ', '班表來源試算表 ID 不符');
assert(site.menu?.spreadsheetId === '1nYJJJNJTLU19mBNm3Sjwo_Ep54AZPQl-PCS6koLFe84', '菜單 CMS 試算表 ID 不符');
assert(fs.statSync(path.join(ROOT, site.hero.video)).size > 3_000_000, '首頁試播影片檔案過小或不存在');

const report = {
  checkedAt: new Date().toISOString(),
  version: site.version,
  errors,
  warnings,
  counts: {
    roster: roster.length,
    events: events.events.length,
    menuItems: menuItems.length,
    scheduleFallbackRows: schedule.rows.length,
    localReferences: localReferences.size,
  },
  index: {
    bytes: Buffer.byteLength(html),
    sha256: crypto.createHash('sha256').update(html).digest('hex'),
  },
};
fs.mkdirSync(path.join(ROOT, 'verification'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'verification', 'static-validation.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
