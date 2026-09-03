export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}

export async function fetchSheetCsv(spreadsheetId, sheetName, timeoutMs = 10000) {
  if (!spreadsheetId || !sheetName) throw new Error('Missing Google Sheet configuration');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 10000));
  const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', sheetName);
  url.searchParams.set('headers', '0');
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1', 'user-agent': 'MagicOffice-Website/3.0' },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw new Error('Google Sheets returned empty CSV');
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('Google Sheets CSV contained no rows');
    return rows;
  } finally { clearTimeout(timer); }
}

export function rowsToObjects(rows, headerIndex = 0) {
  if (!Array.isArray(rows) || !rows[headerIndex]) return [];
  const headers = rows[headerIndex].map((value) => String(value ?? '').trim());
  return rows.slice(headerIndex + 1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, String(cells[index] ?? '').trim()])))
    .filter((object) => Object.values(object).some(Boolean));
}

export function rowsToObjectsByHeaders(rows, requiredHeaders = []) {
  if (!Array.isArray(rows)) return [];
  const headerIndex = rows.findIndex((cells) => requiredHeaders.every((required) => cells.map((cell) => String(cell ?? '').trim()).includes(required)));
  if (headerIndex < 0) throw new Error(`Could not locate CSV header row: ${requiredHeaders.join(', ')}`);
  return rowsToObjects(rows, headerIndex);
}

export function sendJson(res, statusCode, payload, { cacheSeconds = 0, noStore = false } = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Accept-Encoding');
  if (noStore) res.setHeader('Cache-Control', 'no-store, max-age=0');
  else {
    const seconds = Math.max(0, Number(cacheSeconds) || 0);
    res.setHeader('Cache-Control', seconds ? `public, s-maxage=${seconds}, stale-while-revalidate=${Math.max(seconds * 12, 300)}` : 'no-cache');
  }
  res.end(JSON.stringify(payload));
}
