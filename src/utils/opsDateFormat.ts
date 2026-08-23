import { parseSessionDateYmd } from "./sessionDate";

const OPS_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/** Ngày phiên Ops — một format đọc được: `23-AUG-2026`. */
export function formatOpsWorkDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${OPS_MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** YYYY-MM-DD → `23-AUG-2026`. */
export function formatOpsWorkDateYmd(ymd: string): string {
  return formatOpsWorkDate(parseSessionDateYmd(ymd));
}
