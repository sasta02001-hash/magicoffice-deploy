import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSheetCsv, rowsToObjects, rowsToObjectsByHeaders } from '../api/_shared.js';
import { normalizeScheduleRows } from '../api/schedule.js';
import { normalizeMenuData } from '../api/menu.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(ROOT, 'content');
const site = JSON.parse(fs.readFileSync(path.join(contentDir, 'site.json'), 'utf8'));
const soft = process.argv.includes('--soft');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1] || 'all';

function save(name, data) {
  const file = path.join(contentDir, name);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
  JSON.parse(fs.readFileSync(temp, 'utf8'));
  fs.renameSync(temp, file);
  console.log(`[sync] updated ${name}`);
}

async function syncSchedule() {
  const csv = await fetchSheetCsv(site.schedule.spreadsheetId, site.schedule.sheetName, 12000);
  const rows = normalizeScheduleRows(rowsToObjects(csv, 0));
  if (!rows.length) throw new Error('公開班表沒有有效資料');
  const latest = rows.map((row) => row.updatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();
  save('schedule-fallback.json', {
    schemaVersion: '2.0', generatedAt: new Date().toISOString(), updatedAt: latest,
    source: 'Google Sheets｜官網公開班表部署快照', rows,
  });
}

async function syncMenu() {
  const [itemsCsv, categoriesCsv, worldsCsv] = await Promise.all([
    fetchSheetCsv(site.menu.spreadsheetId, site.menu.itemsSheet, 12000),
    fetchSheetCsv(site.menu.spreadsheetId, site.menu.categoriesSheet, 12000),
    fetchSheetCsv(site.menu.spreadsheetId, site.menu.worldsSheet, 12000),
  ]);
  const data = normalizeMenuData(
    rowsToObjectsByHeaders(itemsCsv, ['品項 ID', '世界代碼', '分類代碼', '品項名稱']),
    rowsToObjectsByHeaders(categoriesCsv, ['分類代碼', '世界代碼', '分類名稱']),
    rowsToObjectsByHeaders(worldsCsv, ['世界代碼', '世界名稱']),
  );
  if (!data.worlds.length || data.worlds.some((world) => !world.groups.length)) throw new Error('菜單 CMS 回傳不完整');
  data.source = 'Google Sheets｜官網菜單 CMS 部署快照';
  save('menu-fallback.json', data);
}

const jobs = [];
if (only === 'all' || only === 'schedule') jobs.push(['schedule', syncSchedule]);
if (only === 'all' || only === 'menu') jobs.push(['menu', syncMenu]);
let failed = false;
for (const [name, job] of jobs) {
  try { await job(); }
  catch (error) {
    failed = true;
    console.warn(`[sync] ${name} failed; existing fallback retained: ${error?.message || error}`);
    if (!soft) throw error;
  }
}
if (failed && !soft) process.exitCode = 1;
