import site from '../content/site.json' with { type: 'json' };
import fallback from '../content/menu-fallback.json' with { type: 'json' };
import { fetchSheetCsv, rowsToObjectsByHeaders, sendJson } from './_shared.js';

const IMAGES = {
  CAFE: 'assets/images/menu/cafe.webp',
  BAR: 'assets/images/menu/bar.webp',
  COLLECTION: 'assets/images/menu/collection-ukiyoe-banner.webp',
};
const KEYS = { CAFE: 'cafe', BAR: 'bar', COLLECTION: 'collection' };

function number(value, fallbackValue = 999) {
  const normalized = Number(String(value ?? '').replaceAll(',', '').trim());
  return Number.isFinite(normalized) ? normalized : fallbackValue;
}

function normalizePrice(row) {
  if (row['官網顯示預覽']) return row['官網顯示預覽'];
  if (row['價格文字']) return row['價格文字'];
  if (row['價格類型'] === '固定價格' && row['價格數字']) return `NT$${number(row['價格數字'], 0).toLocaleString('en-US')}`;
  return row['價格類型'] || '請詢問現場';
}

export function normalizeMenuData(itemsObjects, categoryObjects, worldObjects) {
  const categories = new Map(categoryObjects.filter((row) => row['分類代碼']).map((row) => [row['分類代碼'], row]));
  const groupedItems = new Map();
  const itemIds = new Set();
  let visibleItemCount = 0;

  for (const row of itemsObjects) {
    const worldCode = row['世界代碼'];
    const categoryCode = row['分類代碼'];
    const id = row['品項 ID'];
    if (!worldCode || !categoryCode || !id) continue;
    if (itemIds.has(id)) throw new Error(`Duplicate menu item ID: ${id}`);
    itemIds.add(id);
    if (!groupedItems.has(categoryCode)) groupedItems.set(categoryCode, []);
    const item = {
      id,
      name: row['品項名稱'],
      description: row['品項說明'] || '',
      price: normalizePrice(row),
      status: row['狀態'] || '供應中',
      sort: number(row['排序']),
      tags: row['標籤'] || '',
      updatedAt: row['最後更新日期'] || '',
    };
    if (item.status !== '隱藏') visibleItemCount += 1;
    groupedItems.get(categoryCode).push(item);
  }

  const worlds = worldObjects
    .filter((row) => row['世界代碼'] && row['狀態'] !== '隱藏')
    .map((row) => {
      const code = row['世界代碼'];
      const groups = [...categories.values()]
        .filter((category) => category['世界代碼'] === code && category['狀態'] !== '隱藏')
        .sort((a, b) => number(a['分類排序']) - number(b['分類排序']))
        .map((category) => ({
          id: category['分類代碼'],
          title: category['分類名稱'],
          sort: number(category['分類排序']),
          status: category['狀態'] || '顯示',
          note: category['分類備註'] || '',
          items: (groupedItems.get(category['分類代碼']) || [])
            .filter((item) => item.status !== '隱藏')
            .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)),
        }))
        .filter((group) => group.items.length);
      const facts = [
        row['營業時間'],
        row['低消'],
        row['服務費'] ? `服務費 ${row['服務費']}` : '',
        row['包廂'] ? `包廂 ${row['包廂']}` : '',
        row['主餐供應'] ? `主餐供應 ${row['主餐供應']}` : '',
      ].filter(Boolean).join('｜');
      return {
        code,
        key: KEYS[code] || code.toLowerCase(),
        tab: row['分頁名稱'] || row['世界名稱'],
        eyebrow: `${row['英文標籤'] || code}${row['營業時間'] ? ` · ${row['營業時間']}` : ''}`,
        title: row['區塊標題'] || row['世界名稱'],
        intro: [row['區塊導讀'], facts].filter(Boolean).join(' '),
        image: IMAGES[code] || '',
        note: row['區塊備註'] || '',
        groups,
      };
    });

  if (worlds.length < 3 || worlds.some((world) => !world.groups.length) || visibleItemCount < 80) {
    throw new Error(`Menu CMS incomplete: worlds=${worlds.length}, visibleItems=${visibleItemCount}`);
  }
  return {
    schemaVersion: '2.1',
    updatedAt: new Date().toISOString(),
    source: 'Google Sheets｜官網菜單 CMS v1.0',
    stale: false,
    worlds,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' }, { noStore: true });
  try {
    const [itemsRows, categoryRows, worldRows] = await Promise.all([
      fetchSheetCsv(site.menu.spreadsheetId, site.menu.itemsSheet, Number(site.menu.timeoutMs) || 10000),
      fetchSheetCsv(site.menu.spreadsheetId, site.menu.categoriesSheet, Number(site.menu.timeoutMs) || 10000),
      fetchSheetCsv(site.menu.spreadsheetId, site.menu.worldsSheet, Number(site.menu.timeoutMs) || 10000),
    ]);
    // Locate CMS headers by their stable field names. This remains valid when instruction or blank rows are inserted above the table.
    const data = normalizeMenuData(
      rowsToObjectsByHeaders(itemsRows, ['品項 ID', '世界代碼', '分類代碼', '品項名稱']),
      rowsToObjectsByHeaders(categoryRows, ['分類代碼', '世界代碼', '分類名稱']),
      rowsToObjectsByHeaders(worldRows, ['世界代碼', '世界名稱']),
    );
    return sendJson(res, 200, data, { cacheSeconds: (Number(site.menu.cacheMinutes) || 5) * 60 });
  } catch {
    return sendJson(res, 200, {
      ...fallback,
      source: '官網發布菜單（即時同步暫時不可用）',
      stale: true,
      errorCode: 'MENU_SYNC_UNAVAILABLE',
    }, { noStore: true });
  }
}
