/** Pure helpers for eCargo «Thêm AWB» modal — dùng trong Playwright evaluate + unit test. */

export function splitEcargoFlight(value) {
  const flight = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const two = flight.match(/^([A-Z]{2})(\d{3,4}[A-Z]?)$/);
  if (two) return { carrier: two[1], flightNo: two[2] };
  const three = flight.match(/^([A-Z0-9]{3})(\d{3,4}[A-Z]?)$/);
  if (three) return { carrier: three[1], flightNo: three[2] };
  return { carrier: flight.slice(0, 2), flightNo: flight.slice(2) };
}

export function scoreEcargoModalSaveLabel(label) {
  const t = String(label || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return -100;
  if (/h[uủ]y|cancel|quay\s*lại/i.test(t)) return -100;
  // Modal eCargo dùng «Save & Close» — không loại vì có chữ close.
  if (/save\s*&?\s*close/i.test(t)) return 100;
  if (/^close$/i.test(t) || (/\bclose\b/i.test(t) && !/save/i.test(t))) return -100;
  if (/^l[uư]u$/i.test(t)) return 100;
  if (/x[aá]c\s*nh[aậ]n/i.test(t)) return 95;
  if (/^ok$/i.test(t)) return 90;
  if (/^save$/i.test(t)) return 90;
  if (/th[eê]m\s*house/i.test(t)) return 10;
  if (/^th[eê]m$/i.test(t)) return 80;
  if (/th[eê]m\s*awb/i.test(t)) return 20;
  if (/th[eê]m/i.test(t)) return 70;
  return -1;
}

export function pickEcargoModalSaveLabel(labels) {
  const ranked = (labels ?? [])
    .map((label) => ({ label, score: scoreEcargoModalSaveLabel(label) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.label ?? null;
}

export function mawbDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

/** Kiểm tra dòng bảng có chứa MAWB (prefix + suffix hoặc compact 11 số). */
export function rowTextContainsMawb(rowText, mawbRaw) {
  const compactRow = String(rowText || "").replace(/\s+/g, "");
  if (!compactRow) return false;
  const digits = mawbDigits(mawbRaw);
  if (digits.length < 11) return compactRow.length > 0;
  const prefix = digits.slice(0, 3);
  const suffix = digits.slice(3);
  if (compactRow.includes(digits)) return true;
  if (compactRow.includes(`${prefix}-${suffix}`)) return true;
  if (compactRow.includes(prefix) && compactRow.includes(suffix)) return true;
  return false;
}
