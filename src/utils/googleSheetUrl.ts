/**
 * Parse spreadsheet ID và gid tab từ URL Google Sheets hoặc chuỗi ID thuần.
 */
export function parseGoogleSheetLink(raw: string): {
  ok: true;
  spreadsheetId: string;
  sheetGid?: string;
} | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) {
    return { ok: false, error: "Nhập URL Google Sheet trước khi kéo dữ liệu." };
  }

  const fromPath = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = s.match(/[?#&]gid=(\d+)/);
  const sheetGid = gidMatch?.[1];

  if (fromPath?.[1]) {
    return { ok: true, spreadsheetId: fromPath[1], ...(sheetGid ? { sheetGid } : {}) };
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(s) && !/\s/.test(s) && !s.includes("://")) {
    return { ok: true, spreadsheetId: s };
  }

  return {
    ok: false,
    error: "URL không hợp lệ. Dán link dạng https://docs.google.com/spreadsheets/d/…",
  };
}

/** @deprecated Dùng parseGoogleSheetLink */
export function parseGoogleSpreadsheetId(raw: string): {
  ok: true;
  spreadsheetId: string;
} | { ok: false; error: string } {
  const r = parseGoogleSheetLink(raw);
  if (!r.ok) return r;
  return { ok: true, spreadsheetId: r.spreadsheetId };
}
