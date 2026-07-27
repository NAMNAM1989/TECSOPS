/**
 * Trích ID spreadsheet từ link Google Sheets hoặc chuỗi ID thuần.
 * @param {string} raw
 * @returns {string}
 */
export function parseSpreadsheetIdFromInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const fromPath = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath?.[1]) return fromPath[1];

  const fromQuery = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromQuery?.[1]) return fromQuery[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;

  throw new Error(
    "Link Google Sheet không hợp lệ — dán link share (docs.google.com/spreadsheets/d/…) hoặc ID spreadsheet."
  );
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function resolveSpreadsheetId(raw) {
  const parsed = parseSpreadsheetIdFromInput(raw);
  if (parsed) return parsed;
  throw new Error("Thiếu ID Google Sheet.");
}
