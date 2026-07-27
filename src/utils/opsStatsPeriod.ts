import {
  addLocalDays,
  formatLocalSessionDate,
  parseSessionDateYmd,
} from "./sessionDate";

/** Chế độ chọn kỳ trên trang Thống kê. */
export type StatsPeriodMode = "today" | "day" | "month" | "year" | "range";

export type StatsPeriodRange = {
  fromYmd: string;
  toYmd: string;
};

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
  if (mode === "month" && fromYmd.endsWith("-01")) {
    return fromYmd.slice(0, 7);
  }
  if (mode === "year" && fromYmd.endsWith("-01-01") && toYmd.endsWith("-12-31")) {
    return fromYmd.slice(0, 4);
  }
  return `${fromYmd} → ${toYmd}`;
}

/** Lùi/tiến một bước theo mode (ngày / tháng / năm). */
export function shiftStatsPeriodAnchor(
  mode: StatsPeriodMode,
  anchorYmd: string,
  delta: number
): string {
  const d = parseSessionDateYmd(anchorYmd);
  if (mode === "month") {
    return formatLocalSessionDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }
  if (mode === "year") {
    return formatLocalSessionDate(new Date(d.getFullYear() + delta, 0, 1));
  }
  return formatLocalSessionDate(addLocalDays(d, delta));
}
