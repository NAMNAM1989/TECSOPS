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

const MONTH3_SET = new Set(MONTHS3);

/** Trích DDMMM từ cutoff note (vd. «17:00 - 13JUN»). Chỉ nhận tháng JAN…DEC — tránh «BUP 1 PMC» → 1PMC. */
export function extractCutoffOpsDateToken(cutoffNote) {
  const t = String(cutoffNote ?? "").trim();
  if (!t) return "";
  const compact = t.replace(/\s/g, "");
  const re = /(\d{1,2})([A-Za-z]{3})/g;
  let m;
  while ((m = re.exec(compact))) {
    const mon = m[2].toUpperCase();
    if (MONTH3_SET.has(mon)) return `${parseInt(m[1], 10)}${mon}`;
  }
  return "";
}

/**
 * Ngày phiên = ngày tab Sheet đã resolve (vd. «NGÀY 20 JUL» → 2026-07-20).
 * Giữ mọi dòng trên tab — cutoff/ngày bay (có thể N+1) chỉ là thông tin lô, không loại dòng.
 */
export function rowMatchesSessionDate(_row, sessionYmd) {
  return Boolean(sessionYmdToFlightDateToken(sessionYmd));
}

/** @template {{ cutoffNote?: string, flightDate?: string }} T */
export function filterRowsForSessionDate(rows, sessionYmd) {
  if (!sessionYmdToFlightDateToken(sessionYmd)) return [];
  return rows;
}
