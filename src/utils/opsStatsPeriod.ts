import {
  addLocalDays,
  formatLocalSessionDate,
  parseSessionDateYmd,
} from "./sessionDate";

/** Chế độ chọn kỳ trên trang Thống kê. */
export type StatsPeriodMode = "today" | "day" | "week" | "month" | "year" | "range";

export type StatsPeriodRange = {
  fromYmd: string;
  toYmd: string;
};

/** IANA — nhãn / «hôm nay» của kỳ tuần (không convert `session_date`). */
export const STATS_DISPLAY_TIME_ZONE = "Asia/Saigon";

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

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Ngày hôm nay theo lịch máy (YYYY-MM-DD). */
export function todaySessionYmd(now = new Date()): string {
  return formatLocalSessionDate(now);
}

/** YYYY-MM-DD theo lịch Asia/Saigon — dùng mặc định kỳ tuần. */
export function todayYmdAsiaSaigon(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATS_DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function isValidSessionYmd(ymd: string): boolean {
  const m = YMD_RE.exec(ymd.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Thứ Hai của tuần chứa `ymd` — cùng quy ước Postgres `date_trunc('week')`
 * (ISO: tuần bắt đầu Monday, kết thúc Sunday).
 * So sánh `session_date` dạng DATE thuần, không đổi timezone.
 */
export function weekStartYmd(ymd: string): string | null {
  const raw = ymd.trim();
  if (!isValidSessionYmd(raw)) return null;
  const d = parseSessionDateYmd(raw);
  const daysFromMonday = (d.getDay() + 6) % 7;
  return formatLocalSessionDate(addLocalDays(d, -daysFromMonday));
}

/** Chủ Nhật = week_start + 6. */
export function weekEndYmd(ymd: string): string | null {
  const start = weekStartYmd(ymd);
  if (!start) return null;
  return formatLocalSessionDate(addLocalDays(parseSessionDateYmd(start), 6));
}

/** Khoảng inclusive Monday–Sunday chứa `ymd`. */
export function weekYmdToRange(ymd: string): StatsPeriodRange | null {
  const fromYmd = weekStartYmd(ymd);
  const toYmd = weekEndYmd(ymd);
  if (!fromYmd || !toYmd) return null;
  return { fromYmd, toYmd };
}

/**
 * Nhãn tuần rõ: `17–23 AUG 2026`, hoặc `31 AUG – 6 SEP 2026` khi sang tháng.
 */
export function formatWeekRangeLabel(fromYmd: string, toYmd: string): string {
  if (!isValidSessionYmd(fromYmd) || !isValidSessionYmd(toYmd)) {
    return `${fromYmd} → ${toYmd}`;
  }
  const a = parseSessionDateYmd(fromYmd);
  const b = parseSessionDateYmd(toYmd);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${OPS_MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (sameYear) {
    return `${a.getDate()} ${OPS_MONTHS[a.getMonth()]} – ${b.getDate()} ${OPS_MONTHS[b.getMonth()]} ${a.getFullYear()}`;
  }
  return `${a.getDate()} ${OPS_MONTHS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${OPS_MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/**
 * Empty-state khi tuần đã chọn không có lô.
 * Luôn nhắc **khoảng tuần đang xem** — không dùng «Tuần này trống»
 * (tránh lẫn với CTA điều hướng «Tuần này»).
 */
export function formatWeekEmptyCopy(weekLabel: string): { title: string; description: string } {
  const range = weekLabel.trim() || "đã chọn";
  return {
    title: `Tuần ${range} trống`,
    description:
      "Không có lô trong tuần đã chọn — chuyển tuần trước/sau, lọc kho (một số tuần có kg lệch), hoặc nhập liệu trên Ops rồi quay lại.",
  };
}

/** Tháng hiện tại `YYYY-MM`. */
export function currentMonthYm(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** Đầu / cuối tháng từ `YYYY-MM`. */
export function monthYmToRange(monthYm: string): StatsPeriodRange | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthYm.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  const last = lastDayOfMonth(year, month);
  return {
    fromYmd: `${year}-${pad2(month)}-01`,
    toYmd: `${year}-${pad2(month)}-${pad2(last)}`,
  };
}

/** Đầu / cuối năm. */
export function yearToRange(year: number): StatsPeriodRange | null {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return null;
  return {
    fromYmd: `${year}-01-01`,
    toYmd: `${year}-12-31`,
  };
}

export type ResolveStatsPeriodInput = {
  mode: StatsPeriodMode;
  /** Ngày đơn (mode day) */
  dayYmd?: string;
  /** Mốc bất kỳ trong tuần (mode week) — snap về Monday–Sunday */
  weekYmd?: string;
  /** `YYYY-MM` (mode month) */
  monthYm?: string;
  /** Năm (mode year) */
  year?: number;
  rangeFromYmd?: string;
  rangeToYmd?: string;
  /** Override “hôm nay” (test) */
  todayYmd?: string;
};

/** Quy kỳ UI → khoảng `sessionDate` inclusive. */
export function resolveStatsPeriodRange(input: ResolveStatsPeriodInput): StatsPeriodRange {
  const today = (input.todayYmd ?? todaySessionYmd()).trim();

  switch (input.mode) {
    case "today":
      return { fromYmd: today, toYmd: today };
    case "day": {
      const d = (input.dayYmd ?? today).trim();
      return { fromYmd: d, toYmd: d };
    }
    case "week": {
      const anchor = (input.weekYmd ?? today).trim();
      return weekYmdToRange(anchor) ?? weekYmdToRange(today) ?? { fromYmd: today, toYmd: today };
    }
    case "month": {
      const ym = (input.monthYm ?? currentMonthYm()).trim();
      return monthYmToRange(ym) ?? { fromYmd: today, toYmd: today };
    }
    case "year": {
      const y = input.year ?? Number(today.slice(0, 4));
      return yearToRange(y) ?? { fromYmd: today, toYmd: today };
    }
    case "range": {
      let from = (input.rangeFromYmd ?? today).trim();
      let to = (input.rangeToYmd ?? today).trim();
      if (!from) from = today;
      if (!to) to = today;
      if (from > to) [from, to] = [to, from];
      return { fromYmd: from, toYmd: to };
    }
    default:
      return { fromYmd: today, toYmd: today };
  }
}

/** Nhãn kỳ ngắn cho UI / tên file. */
export function formatStatsPeriodLabel(range: StatsPeriodRange, mode: StatsPeriodMode): string {
  const { fromYmd, toYmd } = range;
  if (fromYmd === toYmd) {
    if (mode === "today") return `Hôm nay (${fromYmd})`;
    return fromYmd;
  }
  if (mode === "week") {
    return `T2–CN · ${formatWeekRangeLabel(fromYmd, toYmd)}`;
  }
  if (mode === "month" && fromYmd.endsWith("-01")) {
    return fromYmd.slice(0, 7);
  }
  if (mode === "year" && fromYmd.endsWith("-01-01") && toYmd.endsWith("-12-31")) {
    return fromYmd.slice(0, 4);
  }
  return `${fromYmd} → ${toYmd}`;
}

/** Lùi/tiến một bước theo mode (ngày / tuần / tháng / năm). */
export function shiftStatsPeriodAnchor(
  mode: StatsPeriodMode,
  anchorYmd: string,
  delta: number
): string {
  const d = parseSessionDateYmd(anchorYmd);
  if (mode === "week") {
    const start = weekStartYmd(anchorYmd);
    const base = start ? parseSessionDateYmd(start) : d;
    return formatLocalSessionDate(addLocalDays(base, delta * 7));
  }
  if (mode === "month") {
    return formatLocalSessionDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }
  if (mode === "year") {
    return formatLocalSessionDate(new Date(d.getFullYear() + delta, 0, 1));
  }
  return formatLocalSessionDate(addLocalDays(d, delta));
}

/** Số ngày inclusive trong khoảng YYYY-MM-DD. */
export function statsRangeDayCount(range: StatsPeriodRange): number {
  const a = parseSessionDateYmd(range.fromYmd);
  const b = parseSessionDateYmd(range.toYmd);
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Kỳ liền trước cùng độ dài / cùng mode (so sánh KPI).
 * today/day → −1 ngày; week → −7; month/year → lịch; range → lùi bằng số ngày kỳ hiện tại.
 */
export function previousStatsPeriodRange(
  range: StatsPeriodRange,
  mode: StatsPeriodMode
): StatsPeriodRange {
  if (mode === "week") {
    const prevAnchor = shiftStatsPeriodAnchor("week", range.fromYmd, -1);
    return weekYmdToRange(prevAnchor) ?? {
      fromYmd: shiftStatsPeriodAnchor("day", range.fromYmd, -7),
      toYmd: shiftStatsPeriodAnchor("day", range.toYmd, -7),
    };
  }
  if (mode === "month") {
    const ym = range.fromYmd.slice(0, 7);
    const [y, m] = ym.split("-").map(Number);
    const prev = m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, "0")}`;
    return monthYmToRange(prev) ?? range;
  }
  if (mode === "year") {
    const y = Number(range.fromYmd.slice(0, 4)) - 1;
    return yearToRange(y) ?? range;
  }
  if (mode === "today" || mode === "day") {
    const d = shiftStatsPeriodAnchor("day", range.fromYmd, -1);
    return { fromYmd: d, toYmd: d };
  }
  const n = statsRangeDayCount(range);
  return {
    fromYmd: formatLocalSessionDate(addLocalDays(parseSessionDateYmd(range.fromYmd), -n)),
    toYmd: formatLocalSessionDate(addLocalDays(parseSessionDateYmd(range.toYmd), -n)),
  };
}

/** % đổi: null nếu không so được (prev=0 và cur>0 → +∞ hiển thị riêng). */
export function pctDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatPctDeltaLabel(delta: number | null, current: number, previous: number): string {
  if (previous === 0 && current > 0) return "mới";
  if (delta == null) return "—";
  if (delta === 0) return "0%";
  return `${delta > 0 ? "+" : ""}${delta}%`;
}
