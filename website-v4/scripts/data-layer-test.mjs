import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../api/_shared.js';
import scheduleHandler from '../api/schedule.js';
import menuHandler from '../api/menu.js';
import menuFallback from '../content/menu-fallback.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'verification', 'data-layer-report.json');

function csv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',')).join('\n');
}

function response(text, status = 200, contentType = 'text/csv') {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'https://docs.google.com/mock',
    headers: new Headers({ 'content-type': contentType }),
    text: async () => text,
  };
}

function invoke(handler, method = 'GET') {
  return new Promise((resolve, reject) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
      end(body = '') {
        try { resolve({ statusCode: this.statusCode, headers, body: JSON.parse(String(body || '{}')) }); }
        catch (error) { reject(error); }
      },
    };
    Promise.resolve(handler({ method }, res)).catch(reject);
  });
}

function menuCmsCsv() {
  const itemsHeader = ['品項 ID','世界代碼','世界名稱','分類代碼','分類名稱','品項名稱','品項說明','價格類型','價格數字','價格文字','官網顯示預覽','狀態','排序','標籤','內部備註','最後更新日期'];
  const categoryHeader = ['分類代碼','世界代碼','世界名稱','分類名稱','分類排序','分類備註','狀態'];
  const worldHeader = ['世界代碼','世界名稱','分頁名稱','英文標籤','區塊標題','區塊導讀','營業時間','低消','服務費','包廂','主餐供應','區塊備註','狀態','世界排序'];
  const itemRows = [];
  const categoryRows = [];
  const worldRows = [];
  for (const [worldIndex, world] of menuFallback.worlds.entries()) {
    const worldName = world.tab;
    const eyebrowParts = String(world.eyebrow || world.code).split(' · ');
    const time = eyebrowParts.length > 1 ? eyebrowParts.at(-1) : '';
    worldRows.push([world.code, worldName, world.tab, eyebrowParts[0], world.title, world.intro, time, '', '', '', '', world.note || '', '顯示', (worldIndex + 1) * 10]);
    for (const group of world.groups || []) {
      categoryRows.push([group.id, world.code, worldName, group.title, group.sort || 999, group.note || '', group.status || '顯示']);
      for (const item of group.items || []) {
        itemRows.push([item.id, world.code, worldName, group.id, group.title, item.name, item.description || '', '顯示價格', '', item.price || '', item.price || '', item.status || '供應中', item.sort || 999, item.tags || '', '', item.updatedAt || '']);
      }
    }
  }
  const pad = (header, rows) => csv([['MagicOffice CMS'],['說明'],[],header,...rows]);
  return {
    '菜單品項': pad(itemsHeader, itemRows),
    '分類設定': pad(categoryHeader, categoryRows),
    '世界設定': pad(worldHeader, worldRows),
  };
}

const report = { checkedAt: new Date().toISOString(), tests: [], failures: [] };
async function test(name, callback) {
  try {
    await callback();
    report.tests.push({ name, ok: true });
  } catch (error) {
    report.tests.push({ name, ok: false, error: String(error?.stack || error) });
    report.failures.push(name);
  }
}

const originalFetch = global.fetch;

await test('CSV parser preserves quoted commas, quotes and newlines', () => {
  const rows = parseCsv('name,note\n"A, B","line 1\nline 2"\n"Q""Q",ok');
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], 'A, B');
  assert.equal(rows[1][1], 'line 1\nline 2');
  assert.equal(rows[2][0], 'Q"Q');
});

await test('Schedule API normalizes, sorts and marks fresh data correctly', async () => {
  const sheet = csv([
    ['日期','姓名','開始時間','結束時間','班別','主題服裝','特殊活動','顯示順序','最後更新時間'],
    ['2026-09-02','乙','18:00','22:00','夜間','','','20','2026-09-01 10:00:00'],
    ['2026-09-01','甲','14:00','20:00','午後','心跳應援','','10','2026-09-01 11:00:00'],
  ]);
  global.fetch = async () => response(sheet);
  const result = await invoke(scheduleHandler);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.stale, false);
  assert.equal(result.body.rows.length, 2);
  assert.equal(result.body.rows[0].name, '甲');
  assert.match(result.headers['cache-control'], /s-maxage=300/);
});

await test('Schedule API returns no-store published snapshot when live sync fails', async () => {
  global.fetch = async () => { throw new Error('offline'); };
  const result = await invoke(scheduleHandler);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.stale, true);
  assert.equal(result.body.errorCode, 'SCHEDULE_SYNC_UNAVAILABLE');
  assert.match(result.headers['cache-control'], /^no-store(?:,|$)/);
  assert.ok(result.body.rows.length > 0);
});

await test('Menu API accepts complete CMS and returns 3 worlds / 88 items', async () => {
  const sheets = menuCmsCsv();
  global.fetch = async (input) => {
    const url = new URL(String(input));
    const sheet = url.searchParams.get('sheet');
    assert.ok(sheets[sheet], `unexpected sheet ${sheet}`);
    return response(sheets[sheet]);
  };
  const result = await invoke(menuHandler);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.stale, false);
  assert.equal(result.body.worlds.length, 3);
  const count = result.body.worlds.flatMap((world) => world.groups.flatMap((group) => group.items)).length;
  assert.equal(count, 88);
  assert.match(result.headers['cache-control'], /s-maxage=300/);
});

await test('Menu API rejects duplicate IDs and safely returns published snapshot', async () => {
  const sheets = menuCmsCsv();
  const lines = sheets['菜單品項'].split('\n');
  const firstData = lines[4].split(',')[0];
  const second = lines[5].split(',');
  second[0] = firstData;
  lines[5] = second.join(',');
  sheets['菜單品項'] = lines.join('\n');
  global.fetch = async (input) => response(sheets[new URL(String(input)).searchParams.get('sheet')]);
  const result = await invoke(menuHandler);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.stale, true);
  assert.equal(result.body.errorCode, 'MENU_SYNC_UNAVAILABLE');
  assert.match(result.headers['cache-control'], /^no-store(?:,|$)/);
  assert.equal(result.body.worlds.length, 3);
});

await test('API endpoints reject non-GET requests', async () => {
  const schedule = await invoke(scheduleHandler, 'POST');
  const menu = await invoke(menuHandler, 'POST');
  assert.equal(schedule.statusCode, 405);
  assert.equal(menu.statusCode, 405);
  assert.match(schedule.headers['cache-control'], /^no-store(?:,|$)/);
  assert.match(menu.headers['cache-control'], /^no-store(?:,|$)/);
});

global.fetch = originalFetch;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exit(1);
