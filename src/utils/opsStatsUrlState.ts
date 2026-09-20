import type { WarehouseLayoutFilter } from "../constants/warehouses";
import type { ShipmentStatus } from "../types/shipment";
import type { StatsPeriodMode } from "./opsStatsPeriod";

export type OpsStatsIntelTab = "ops" | "booking" | "market" | "alerts";
export type OpsStatsDetailTab = "lots" | "day" | "warehouse" | "dest";

export type OpsStatsUrlState = {
  mode: StatsPeriodMode;
  dayYmd: string;
  weekYmd: string;
  monthYm: string;
  year: number;
  rangeFrom: string;
  rangeTo: string;
  warehouse: WarehouseLayoutFilter;
  dest: string | "ALL";
  customerKey: string | "ALL";
  flightKey: string | "ALL";
  /** ALL hoặc danh sách status */
  statuses: ShipmentStatus[] | "ALL";
  intelTab: OpsStatsIntelTab;
  detailTab: OpsStatsDetailTab;
  focusYmd: string;
  /** vd. delta:desc */
  sort: string | null;
};

const MODES = new Set<StatsPeriodMode>([
  "today",
  "day",
  "week",
  "month",
  "year",
  "range",
]);
const INTEL = new Set<OpsStatsIntelTab>(["ops", "booking", "market", "alerts"]);
const DETAIL = new Set<OpsStatsDetailTab>(["lots", "day", "warehouse", "dest"]);

function pathAndQuery(hash: string): { path: string; query: string } {
  const raw = hash.replace(/^#\/?/, "");
  const q = raw.indexOf("?");
  if (q < 0) return { path: raw.toLowerCase(), query: "" };
  return { path: raw.slice(0, q).toLowerCase(), query: raw.slice(q + 1) };
}

/** True nếu hash đang trỏ trang stats (kể cả có query). */
export function isStatsHash(hash: string): boolean {
  const { path } = pathAndQuery(hash);
  return path === "stats" || path.startsWith("stats/");
}

export function parseOpsStatsUrlState(hash: string): Partial<OpsStatsUrlState> {
  if (!isStatsHash(hash)) return {};
  const { query } = pathAndQuery(hash);
  if (!query) return {};
  const sp = new URLSearchParams(query);
  const out: Partial<OpsStatsUrlState> = {};

  const mode = sp.get("mode");
  if (mode && MODES.has(mode as StatsPeriodMode)) out.mode = mode as StatsPeriodMode;

  const day = sp.get("day");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) out.dayYmd = day;
  const week = sp.get("week");
  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) out.weekYmd = week;
  const month = sp.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) out.monthYm = month;
  const year = sp.get("year");
  if (year && /^\d{4}$/.test(year)) out.year = Number(year);
  const from = sp.get("from");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) out.rangeFrom = from;
  const to = sp.get("to");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) out.rangeTo = to;

  const wh = sp.get("wh");
  if (wh === "ALL" || wh === "TECS-TCS" || wh === "TECS-SCSC" || wh === "TCS" || wh === "SCSC") {
    out.warehouse = wh;
  }
  const dest = sp.get("dest");
  if (dest) out.dest = dest === "ALL" ? "ALL" : dest;
  const cust = sp.get("cust");
  if (cust) out.customerKey = cust === "ALL" ? "ALL" : cust;
  const flight = sp.get("flight");
  if (flight) out.flightKey = flight === "ALL" ? "ALL" : flight;

  const st = sp.get("st");
  if (st === "ALL" || st === "" || st == null) {
    if (st === "ALL") out.statuses = "ALL";
  } else {
    out.statuses = st.split(",").filter(Boolean) as ShipmentStatus[];
  }

  const tab = sp.get("tab");
  if (tab && INTEL.has(tab as OpsStatsIntelTab)) out.intelTab = tab as OpsStatsIntelTab;
  const detail = sp.get("detail");
  if (detail && DETAIL.has(detail as OpsStatsDetailTab)) {
    out.detailTab = detail as OpsStatsDetailTab;
  }
  const focus = sp.get("focus");
  if (focus && /^\d{4}-\d{2}-\d{2}$/.test(focus)) out.focusYmd = focus;
  const sort = sp.get("sort");
  if (sort) out.sort = sort;

  return out;
}

export function serializeOpsStatsUrlState(state: OpsStatsUrlState): string {
  const sp = new URLSearchParams();
  sp.set("mode", state.mode);
  if (state.mode === "day") sp.set("day", state.dayYmd);
  if (state.mode === "week") sp.set("week", state.weekYmd);
  if (state.mode === "month") sp.set("month", state.monthYm);
  if (state.mode === "year") sp.set("year", String(state.year));
  if (state.mode === "range") {
    sp.set("from", state.rangeFrom);
    sp.set("to", state.rangeTo);
  }
  if (state.warehouse !== "ALL") sp.set("wh", state.warehouse);
  if (state.dest !== "ALL") sp.set("dest", state.dest);
  if (state.customerKey !== "ALL") sp.set("cust", state.customerKey);
  if (state.flightKey !== "ALL") sp.set("flight", state.flightKey);
  if (state.statuses !== "ALL" && state.statuses.length > 0) {
    sp.set("st", state.statuses.join(","));
  }
  if (state.intelTab !== "ops") sp.set("tab", state.intelTab);
  if (state.detailTab !== "lots") sp.set("detail", state.detailTab);
  if (state.focusYmd) sp.set("focus", state.focusYmd);
  if (state.sort) sp.set("sort", state.sort);

  const q = sp.toString();
  return q ? `#/stats?${q}` : "#/stats";
}

/** replaceState hash stats — không đẩy history. */
export function replaceStatsHash(state: OpsStatsUrlState): void {
  if (typeof window === "undefined") return;
  const next = serializeOpsStatsUrlState(state);
  if (window.location.hash === next) return;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${next}`
  );
}
