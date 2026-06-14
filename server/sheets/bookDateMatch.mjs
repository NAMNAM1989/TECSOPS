const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** YYYY-MM-DD → 13JUN (khớp cột ngày bay / cutoff trên Sheet). */
export function sessionYmdToFlightDateToken(sessionYmd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sessionYmd ?? "").trim());
  if (!m) return "";
  const day = parseInt(m[3], 10);
  const mon = parseInt(m[2], 10) - 1;
  if (mon < 0 || mon > 11 || day < 1 || day > 31) return "";
  return `${day}${MONTHS3[mon]}`;
}

/** Trích DDMMM từ cutoff note (vd. «17:00 - 13JUN»). */
export function extractCutoffOpsDateToken(cutoffNote) {
  const t = String(cutoffNote ?? "").trim();
  if (!t) return "";
  const m = /(\d{1,2}[A-Za-z]{3})/.exec(t.replace(/\s/g, ""));
  return m ? m[1].toUpperCase() : "";
}

/**
 * Chỉ giữ lô thuộc ngày phiên đang xem trên web.
 * Tab Sheet đã theo ngày (vd. 13JUNE2026) — mặc định giữ mọi dòng.
 * Chỉ bỏ khi cutoff/note ghi rõ ngày vận hành khác phiên (vd. «17:00 - 14JUN»).
 */
export function rowMatchesSessionDate(row, sessionYmd) {
  const sessionToken = sessionYmdToFlightDateToken(sessionYmd);
  if (!sessionToken) return false;

  const opsFromCutoff = extractCutoffOpsDateToken(row.cutoffNote);
  if (opsFromCutoff) {
    return opsFromCutoff === sessionToken;
  }

  return true;
}

/** @template {{ cutoffNote?: string, flightDate?: string }} T */
export function filterRowsForSessionDate(rows, sessionYmd) {
  return rows.filter((row) => rowMatchesSessionDate(row, sessionYmd));
}
