import { formatLocalSessionDate } from "./sessionDate";

const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** "05APR" + năm → YYYY-MM-DD cho input type=date */
export function parseFlightDateDisplayToYmd(flightDateStr: string, year: number): string {
  const m = /^(\d{2})([A-Za-z]{3})$/.exec(flightDateStr.trim().replace(/\s/g, ""));
  if (!m) return "";
  const day = parseInt(m[1], 10);
  const mon = MONTHS3.indexOf(m[2].toUpperCase() as (typeof MONTHS3)[number]);
  if (mon < 0) return "";
  const d = new Date(year, mon, day);
  return formatLocalSessionDate(d);
}

/** ISO cutoff → phần local cho form */
export function splitIsoToLocalDateTime(iso: string): { date: string; hour: string; minute: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", hour: "", minute: "" };
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    date: `${y}-${mo}-${day}`,
    hour: String(d.getHours()).padStart(2, "0"),
    minute: String(d.getMinutes()).padStart(2, "0"),
  };
}
