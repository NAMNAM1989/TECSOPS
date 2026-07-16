/** Cache ngắn hạn — giảm round-trip Google Sheet khi kéo / nhập lô. */

const TAB_LIST_TTL_MS = 15 * 60 * 1000;
const SESSION_TAB_TTL_MS = 60 * 60 * 1000;
const GRID_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { tabs: { gid: string, title: string }[], expires: number }>} */
const tabListBySpreadsheet = new Map();

/** @type {Map<string, { gid: string, title: string, expires: number }>} */
const sessionTabByKey = new Map();

/** @type {Map<string, { grid: { rowIndex: number, cells: string[] }[], sheetTab: string, expires: number }>} */
const gridBySyncKey = new Map();

function tabListKey(spreadsheetId) {
  return String(spreadsheetId ?? "").trim();
}

export function sessionTabKey(spreadsheetId, sessionYmd) {
  return `${tabListKey(spreadsheetId)}:${String(sessionYmd ?? "").trim()}`;
}

export function gridCacheKey(spreadsheetId, sessionYmd, sheetTab) {
  return `${tabListKey(spreadsheetId)}:${String(sessionYmd ?? "").trim()}:${String(sheetTab ?? "").trim()}`;
}

export function getCachedTabList(spreadsheetId) {
  const hit = tabListBySpreadsheet.get(tabListKey(spreadsheetId));
  if (!hit || hit.expires < Date.now()) return null;
  return hit.tabs;
}

export function setCachedTabList(spreadsheetId, tabs) {
  tabListBySpreadsheet.set(tabListKey(spreadsheetId), {
    tabs,
    expires: Date.now() + TAB_LIST_TTL_MS,
  });
}

export function getCachedSessionTab(spreadsheetId, sessionYmd) {
  const hit = sessionTabByKey.get(sessionTabKey(spreadsheetId, sessionYmd));
  if (!hit || hit.expires < Date.now()) return null;
  return hit;
}

export function setCachedSessionTab(spreadsheetId, sessionYmd, { gid, title }) {
  sessionTabByKey.set(sessionTabKey(spreadsheetId, sessionYmd), {
    gid: String(gid ?? "").trim(),
    title: String(title ?? "").trim(),
    expires: Date.now() + SESSION_TAB_TTL_MS,
  });
}

export function getCachedGrid(spreadsheetId, sessionYmd, sheetTab) {
  const hit = gridBySyncKey.get(gridCacheKey(spreadsheetId, sessionYmd, sheetTab));
  if (!hit || hit.expires < Date.now()) return null;
  return hit;
}

export function setCachedGrid(spreadsheetId, sessionYmd, sheetTab, grid) {
  gridBySyncKey.set(gridCacheKey(spreadsheetId, sessionYmd, sheetTab), {
    grid,
    sheetTab: String(sheetTab ?? "").trim(),
    expires: Date.now() + GRID_TTL_MS,
  });
}

/** Test helper */
export function clearSheetFetchCaches() {
  tabListBySpreadsheet.clear();
  sessionTabByKey.clear();
  gridBySyncKey.clear();
}
