import site from '../content/site.json' with { type: 'json' };
import fallback from '../content/schedule-fallback.json' with { type: 'json' };
import { fetchSheetCsv, rowsToObjects, sendJson } from './_shared.js';

export function normalizeScheduleRows(objects) {
  return objects.map((row) => ({
    date: row['日期'] || '',
    name: row['姓名'] || '',
    startTime: row['開始時間'] || '',
    endTime: row['結束時間'] || '',
    shift: row['班別'] || '',
    costume: row['主題服裝'] || '',
    event: row['特殊活動'] || '',
    sort: row['顯示順序'] || '999',
    updatedAt: row['最後更新時間'] || '',
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' }, { noStore: true });
  try {
    const rows = await fetchSheetCsv(
      site.schedule.spreadsheetId,
      site.schedule.sheetName,
      Number(site.schedule.timeoutMs) || 9000,
    );
    const normalized = normalizeScheduleRows(rowsToObjects(rows, 0));
    if (!normalized.length) throw new Error('No valid schedule rows');
    normalized.sort((a, b) => a.date.localeCompare(b.date) || Number(a.sort || 999) - Number(b.sort || 999));
    const latest = normalized.map((row) => row.updatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();
    return sendJson(res, 200, {
      schemaVersion: '2.1',
      source: 'Google Sheets｜官網公開班表',
      generatedAt: new Date().toISOString(),
      updatedAt: latest,
      stale: false,
      rows: normalized,
    }, { cacheSeconds: (Number(site.schedule.cacheMinutes) || 5) * 60 });
  } catch {
    return sendJson(res, 200, {
      ...fallback,
      source: '官網發布快照（即時同步暫時不可用）',
      stale: true,
      errorCode: 'SCHEDULE_SYNC_UNAVAILABLE',
    }, { noStore: true });
  }
}
