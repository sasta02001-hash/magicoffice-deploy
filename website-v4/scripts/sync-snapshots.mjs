import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import scheduleHandler from '../api/schedule.js';
import menuHandler from '../api/menu.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function invoke(handler) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
      end(body = '') {
        try { resolve({ statusCode: this.statusCode, headers, body: JSON.parse(String(body || '{}')) }); }
        catch (error) { reject(error); }
      },
    };
    Promise.resolve(handler({ method: 'GET' }, res)).catch(reject);
  });
}

async function update(name, handler, target) {
  try {
    const result = await invoke(handler);
    if (result.statusCode !== 200 || result.body?.stale) {
      console.warn(`[MagicOffice] ${name} 即時同步不可用，保留既有快照。`);
      return { name, updated: false, reason: result.body?.errorCode || `HTTP_${result.statusCode}` };
    }
    fs.writeFileSync(path.join(ROOT, target), `${JSON.stringify(result.body, null, 2)}\n`);
    console.log(`[MagicOffice] ${name} 快照已更新：${target}`);
    return { name, updated: true, rows: result.body?.rows?.length, worlds: result.body?.worlds?.length };
  } catch (error) {
    console.warn(`[MagicOffice] ${name} 同步失敗，保留既有快照：${error.message}`);
    return { name, updated: false, reason: error.message };
  }
}

const results = await Promise.all([
  update('本週出勤', scheduleHandler, 'content/schedule-fallback.json'),
  update('菜單 CMS', menuHandler, 'content/menu-fallback.json'),
]);

fs.writeFileSync(path.join(ROOT, 'content', 'snapshot-sync-report.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
