import { formatLocalSessionDate } from "./sessionDate";

const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** "05APR" + năm → YYYY-MM-DD cho input type=date */
export function parseFlightDateDisplayToYmd(flightDateStr: string, year: number): string {
  const m = /^(\d{1,2})([A-Za-z]{3})$/.exec(flightDateStr.trim().replace(/\s/g, ""));
  if (!m) return "";
  const day = parseInt(m[1], 10);
  const mon = MONTHS3.indexOf(m[2].toUpperCase() as (typeof MONTHS3)[number]);
  if (mon < 0 || day < 1 || day > 31) return "";
  const d = new Date(year, mon, day);
  if (d.getFullYear() !== year || d.getMonth() !== mon || d.getDate() !== day) return "";
  return formatLocalSessionDate(d);
}

/**
 * Ngày nhập tay rút gọn: 15APR, 15 APR, 15APR2026, 2026-04-15, 15/04/2026 … → YYYY-MM-DD hoặc "".
 */
export function parseBookingDateLoose(raw: string, defaultYear: number): string {
  const s0 = raw.trim();
  if (!s0) return "";

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s0);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (Number.isNaN(dt.getTime())) return "";
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return "";
    return formatLocalSessionDate(dt);
  }

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s0);
  if (m) {
    const d = +m[1];
    const mo = +m[2];
    const y = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (Number.isNaN(dt.getTime())) return "";
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return "";
    return formatLocalSessionDate(dt);
  }

  const compact = s0.replace(/\s/g, "");
  m = /^(\d{1,2})([A-Za-z]{3})(\d{4})$/.exec(compact);
  if (m) {
    return parseFlightDateDisplayToYmd(`${m[1]}${m[2]}`, parseInt(m[3], 10));
  }

  return parseFlightDateDisplayToYmd(compact, defaultYear);
}

/** YYYY-MM-DD → 06APR (để hiển thị trong ô nhập tay). */
export function ymdToDdMon(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return "";
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return "";
  const months = MONTHS3;
  return `${String(d).padStart(2, "0")}${months[mo - 1]}`;
}

/** YYYY-MM-DD → DDMMM lưu trong Shipment.flightDate */
export function formatYmdToFlightDateDdMon(ymd: string): string {
  return ymdToDdMon(ymd);
}

/**
 * Giờ cutoff nhập tay: 17, 17H, 17h30, 17:30, 1730 → { hour, minute } pad 2.
 */
export function parseCutoffTimeCompact(raw: string): { hour: string; minute: string } | null {
  const s = raw.trim().toUpperCase().replace(/\s/g, "");
  if (!s) return null;

  let m = /^(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const h = +m[1];
    const min = +m[2];
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return { hour: m[1], minute: m[2] };
  }

  m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const h = +m[1];
    const min = +m[2];
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return { hour: String(h).padStart(2, "0"), minute: String(min).padStart(2, "0") };
    }
  }

  m = /^(\d{1,2})H(\d{2})$/.exec(s);
  if (m) {
    const h = +m[1];
    const min = +m[2];
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return { hour: String(h).padStart(2, "0"), minute: String(min).padStart(2, "0") };
    }
  }

  m = /^(\d{1,2})H$/.exec(s);
  if (m) {
    const h = +m[1];
    if (h >= 0 && h <= 23) return { hour: String(h).padStart(2, "0"), minute: "00" };
  }

  m = /^(\d{1,2})$/.exec(s);
  if (m) {
    const h = +m[1];
    if (h >= 0 && h <= 23) return { hour: String(h).padStart(2, "0"), minute: "00" };
  }

  return null;
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

/**
 * Bàn làm việc: giờ + ngày cutoff dạng "17H - 15APR" (phút 0) hoặc "17H30 - 15APR".
 * Dùng cùng logic local với splitIsoToLocalDateTime.
 */
export function formatCutoffDisplayFromLocalParts(ymd: string, hour: string, minute: string): string {
  const ddmon = ymdToDdMon(ymd);
  if (!ddmon) return "";
  const h = parseInt(hour, 10);
  const min = parseInt(minute, 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return "";
  const timePart = min === 0 ? `${h}H` : `${h}H${String(min).padStart(2, "0")}`;
  return `${timePart} - ${ddmon}`;
}

export function formatCutoffDisplayVi(iso: string): string {
  const { date, hour, minute } = splitIsoToLocalDateTime(iso);
  if (!date) return "";
  return formatCutoffDisplayFromLocalParts(date, hour, minute);
}

/** ISO cutoff → chuỗi giờ nhập tay (17H / 17H30). */
export function cutoffIsoToTimeInputText(iso: string): string {
  if (!iso?.trim()) return "";
  const { date, hour, minute } = splitIsoToLocalDateTime(iso);
  if (!date) return "";
  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  return m === 0 ? `${h}H` : `${h}H${String(m).padStart(2, "0")}`;
}

/** ISO cutoff → 15APR (local). */
export function cutoffIsoToDateDdMon(iso: string): string {
  if (!iso?.trim()) return "";
  const { date } = splitIsoToLocalDateTime(iso);
  if (!date) return "";
  return ymdToDdMon(date);
}

/**
 * Ngày cutoff nhập tay + giờ rút gọn → ISO (giống form booking).
 * Trả về "" nếu thiếu một trong hai hoặc parse lỗi.
 */
export function buildCutoffIsoFromDateAndTimeText(
  dateText: string,
  timeText: string,
  defaultYear: number
): string {
  const dTrim = dateText.trim();
  const tTrim = timeText.trim();
  if (!dTrim && !tTrim) return "";
  const dateYmd = parseBookingDateLoose(dTrim, defaultYear);
  const tm = parseCutoffTimeCompact(tTrim);
  if (!dateYmd || !tm) return "";
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const h = Number(tm.hour);
  const min = Number(tm.minute);
  if (Number.isNaN(h) || Number.isNaN(min)) return "";
  return new Date(y, mo - 1, d, h, min).toISOString();
}
