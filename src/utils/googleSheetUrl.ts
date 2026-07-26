/**
 * Parse spreadsheet ID từ URL Google Sheets hoặc chuỗi ID thuần.
 * Spec Đợt F: bắt buộc người dùng dán URL mỗi lần import.
 */
export function parseGoogleSpreadsheetId(raw: string): {
  ok: true;
  spreadsheetId: string;
} | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) {
    return { ok: false, error: "Nhập URL Google Sheet trước khi kéo dữ liệu." };
  }

  const fromPath = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromPath?.[1]) {
    return { ok: true, spreadsheetId: fromPath[1] };
  }

  // ID thuần (khi user chỉ dán id)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s) && !/\s/.test(s) && !s.includes("://")) {
    return { ok: true, spreadsheetId: s };
  }

  return {
    ok: false,
    error: "URL không hợp lệ. Dán link dạng https://docs.google.com/spreadsheets/d/…",
  };
}
