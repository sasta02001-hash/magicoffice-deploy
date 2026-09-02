const SHEET_ID = '15y3DL7_nUj5JLng9mKayhwDnAnZPQgPHg0zCrLdb0BQ';
const SHEET_NAME = '公開班表';
const TZ = 'Asia/Taipei';

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quote && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quote = !quote; continue; }
    if (char === ',' && !quote) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quote) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell); if (row.some((value) => value !== '')) rows.push(row); row = []; cell = ''; continue;
    }
    cell += char;
  }
  row.push(cell); if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function taipeiDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function mondayOf(dateString) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0,10);
}
function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0,10);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(req.query?.start || '') ? req.query.start : mondayOf(taipeiDate());
    const end = addDays(start, 6);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&t=${Date.now()}`;
    const response = await fetch(url, { headers: { 'user-agent': 'MagicOffice/4.3' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Google Sheets ${response.status}`);
    const text = await response.text();
    if (!text.includes('日期') || text.includes('<html')) throw new Error('Schedule sheet is not publicly readable');
    const rows = parseCSV(text);
    const headerIndex = rows.findIndex((row) => row.includes('日期') && row.includes('姓名'));
    if (headerIndex < 0) throw new Error('Schedule header not found');
    const headers = rows[headerIndex].map((value) => value.trim());
    const index = Object.fromEntries(headers.map((value, i) => [value, i]));
    const records = rows.slice(headerIndex + 1).map((row) => ({
      date: (row[index['日期']] || '').trim(), name: (row[index['姓名']] || '').trim(), start: (row[index['開始時間']] || '').trim(), end: (row[index['結束時間']] || '').trim(), shift: (row[index['班別']] || '').trim(), theme: (row[index['主題服裝']] || '').trim(), event: (row[index['特殊活動']] || '').trim(), order: Number(row[index['顯示順序']] || 999), updatedAt: (row[index['最後更新時間']] || '').trim()
    })).filter((item) => item.date >= start && item.date <= end).sort((a,b) => a.date.localeCompare(b.date) || a.order - b.order);
    if (!records.length) throw new Error('No rows for requested week');
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(start, offset);
      return { date, entries: records.filter((item) => item.date === date).map(({date,order,updatedAt,...entry}) => entry) };
    });
    const updatedAt = records.map((item) => item.updatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();
    res.status(200).json({ ok:true, source:'即時同步', updatedAt, weekStart:start, weekEnd:end, days });
  } catch (error) {
    res.status(503).json({ ok:false, source:'unavailable', message:String(error.message || error) });
  }
};
