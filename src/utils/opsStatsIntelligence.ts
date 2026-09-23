import type { Shipment, ShipmentStatus } from "../types/shipment";
import { flightDateToYmd } from "./bookingDateParse";
import { normalizeStatsDest, computeShipmentWeightMetrics } from "./opsStatsMetrics";
import { parseSessionDateYmd } from "./sessionDate";
import {
  shipmentMatchesSearchQuery,
  type ShipmentSearchContext,
} from "./shipmentSearch";

/** Nhãn lô thiếu mã chuyến — khớp dropdown + click booking. */
export const MISSING_FLIGHT_KEY = "(chưa có)";

/** Nhãn lô thiếu AWB — khớp alert + ô tìm bảng lô. */
export const MISSING_AWB_LABEL = "(không AWB)";

/** Trạng thái đã qua / đang ở bước đo volume trở đi. */
const VOLUME_DONE_OR_LATER = new Set<ShipmentStatus>([
  "VOLUME_DONE",
  "CUSTOMS",
  "SECURITY",
  "OLA_PULL",
  "RECEPTION_COMPLETED",
  "WEIGH_SLIP",
  "COMPLETED",
]);

const DOW_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

/**
 * Normalize mã chuyến: uppercase, bỏ khoảng trắng, bỏ zero-pad số.
 * `AK0521` → `AK521`, `sq 185` → `SQ185`.
 */
export function normalizeFlightKey(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/]+/g, "");
  if (!s) return "";
  const m = /^([A-Z]{2,3})(\d+)$/.exec(s);
  if (!m) return s;
  const prefix = m[1]!;
  const num = String(Number(m[2]));
  if (!Number.isFinite(Number(m[2])) || num === "NaN") return s;
  return `${prefix}${num}`;
}

/** 2 ký tự hãng từ flightKey đã normalize (`AK521` → `AK`). */
export function airlinePrefixFromFlightKey(flightKey: string): string {
  const k = normalizeFlightKey(flightKey);
  const m = /^([A-Z]{2,3})/.exec(k);
  return m?.[1]?.slice(0, 2) ?? (k.slice(0, 2) || "(?)");
}

export function normalizeCustomerKey(
  code: string | null | undefined,
  name: string | null | undefined
): { key: string; label: string } {
  const c = String(code ?? "")
    .trim()
    .toUpperCase();
  const n = String(name ?? "").trim();
  if (c) return { key: `code:${c}`, label: n ? `${c} · ${n}` : c };
  if (n) return { key: `name:${n.toUpperCase()}`, label: n };
  return { key: "unknown", label: "(chưa có khách)" };
}

export function sessionDowIndex(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd.trim())) return null;
  return parseSessionDateYmd(ymd.trim()).getDay(); // 0=CN … 6=T7
}

export function sessionDowLabel(ymd: string): string {
  const i = sessionDowIndex(ymd);
  return i == null ? "?" : DOW_VI[i]!;
}

export type StatusMixRow = {
  status: ShipmentStatus;
  lots: number;
  pct: number;
};

/** Phân bổ % lô theo status (chỉ status có ≥1 lô). */
export function computeStatusMix(rows: readonly Shipment[]): StatusMixRow[] {
  const map = new Map<ShipmentStatus, number>();
  for (const s of rows) {
    map.set(s.status, (map.get(s.status) ?? 0) + 1);
  }
  const total = rows.length || 1;
  return [...map.entries()]
    .map(([status, lots]) => ({
      status,
      lots,
      pct: Math.round((lots / total) * 1000) / 10,
    }))
    .sort((a, b) => b.lots - a.lots);
}

/** % lô đã đo volume (VOLUME_DONE trở đi). */
export function computeVolumeDonePct(rows: readonly Shipment[]): number {
  if (rows.length === 0) return 0;
  let n = 0;
  for (const s of rows) {
    if (VOLUME_DONE_OR_LATER.has(s.status)) n += 1;
  }
  return Math.round((n / rows.length) * 1000) / 10;
}

export type OpsStatsAlertKind =
  | "missing_pcs"
  | "missing_kg"
  | "missing_flight"
  | "pending"
  | "cutoff_per"
  | "flight_date_skew";

export type OpsStatsAlert = {
  id: string;
  kind: OpsStatsAlertKind;
  severity: "warn" | "info";
  shipmentId: string;
  sessionDate: string;
  awb: string;
  message: string;
};

function isCutoffPer(note: string): boolean {
  return /\bPER\b/i.test(note.trim()) || note.trim().toUpperCase() === "PER";
}

/** Cảnh báo chất lượng / vận hành trên rows đã filter kỳ. */
export function collectOpsStatsAlerts(rows: readonly Shipment[]): OpsStatsAlert[] {
  const out: OpsStatsAlert[] = [];
  for (const s of rows) {
    const awb = (s.awb || "").trim() || MISSING_AWB_LABEL;
    const day = (s.sessionDate || "").trim();
    const base = { shipmentId: s.id, sessionDate: day, awb };

    if (s.pcs == null || !Number.isFinite(s.pcs) || s.pcs <= 0) {
      out.push({
        ...base,
        id: `${s.id}:missing_pcs`,
        kind: "missing_pcs",
        severity: "warn",
        message: `${awb}: thiếu số kiện (pcs)`,
      });
    }
    if (s.kg == null || !Number.isFinite(s.kg) || s.kg <= 0) {
      out.push({
        ...base,
        id: `${s.id}:missing_kg`,
        kind: "missing_kg",
        severity: "warn",
        message: `${awb}: thiếu kg thực`,
      });
    }
    if (!normalizeFlightKey(s.flight)) {
      out.push({
        ...base,
        id: `${s.id}:missing_flight`,
        kind: "missing_flight",
        severity: "warn",
        message: `${awb}: thiếu mã chuyến`,
      });
    }
    if (s.status === "PENDING") {
      out.push({
        ...base,
        id: `${s.id}:pending`,
        kind: "pending",
        severity: "info",
        message: `${awb}: còn Booking (PENDING)`,
      });
    }
    if (isCutoffPer(s.cutoffNote || "")) {
      out.push({
        ...base,
        id: `${s.id}:cutoff_per`,
        kind: "cutoff_per",
        severity: "warn",
        message: `${awb}: cutoffNote PER`,
      });
    }
    const fdYmd = flightDateToYmd(s.flightDate || "", day);
    if (day && fdYmd && fdYmd !== day) {
      out.push({
        ...base,
        id: `${s.id}:flight_date_skew`,
        kind: "flight_date_skew",
        severity: "info",
        message: `${awb}: ngày bay ${s.flightDate} ≠ phiên ${day}`,
      });
    }
  }
  const order: Record<OpsStatsAlertKind, number> = {
    missing_kg: 0,
    missing_pcs: 1,
    missing_flight: 2,
    cutoff_per: 3,
    flight_date_skew: 4,
    pending: 5,
  };
  out.sort((a, b) => order[a.kind] - order[b.kind] || a.awb.localeCompare(b.awb));
  return out;
}

export type ShareRow = {
  key: string;
  label: string;
  lots: number;
  actualKg: number;
  shareLots: number;
  shareKg: number;
};

function emptyShare(): { lots: number; actualKg: number } {
  return { lots: 0, actualKg: 0 };
}

/** HHI trên share kg — thang 0–1 (Σ share²). */
export function computeHhiFromShares(shareKgList: readonly number[]): number {
  let h = 0;
  for (const s of shareKgList) {
    if (s > 0) h += s * s;
  }
  return Math.round(h * 10000) / 10000;
}

function finalizeShares(
  map: Map<string, { label: string; lots: number; actualKg: number }>
): { rows: ShareRow[]; hhiKg: number } {
  let totalLots = 0;
  let totalKg = 0;
  for (const v of map.values()) {
    totalLots += v.lots;
    totalKg += v.actualKg;
  }
  const rows: ShareRow[] = [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      lots: v.lots,
      actualKg: v.actualKg,
      shareLots: totalLots > 0 ? Math.round((v.lots / totalLots) * 1000) / 10 : 0,
      shareKg: totalKg > 0 ? Math.round((v.actualKg / totalKg) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.actualKg - a.actualKg || b.lots - a.lots || a.label.localeCompare(b.label));
  const hhiKg = computeHhiFromShares(rows.map((r) => r.shareKg));
  return {
    rows: rows.map((r) => ({
      ...r,
      shareKg: Math.round(r.shareKg * 1000) / 10, // % 1 decimal for UI
    })),
    hhiKg,
  };
}

export function computeCustomerShares(rows: readonly Shipment[]): {
  rows: ShareRow[];
  hhiKg: number;
} {
  const map = new Map<string, { label: string; lots: number; actualKg: number }>();
  for (const s of rows) {
    const { key, label } = normalizeCustomerKey(s.customerCode, s.customer);
    const w = computeShipmentWeightMetrics(s);
    let b = map.get(key);
    if (!b) {
      b = { label, ...emptyShare() };
      map.set(key, b);
    }
    b.lots += 1;
    b.actualKg += w.actualKg;
  }
  return finalizeShares(map);
}

export function computeDestShares(rows: readonly Shipment[]): {
  rows: ShareRow[];
  hhiKg: number;
} {
  const map = new Map<string, { label: string; lots: number; actualKg: number }>();
  for (const s of rows) {
    const dest = normalizeStatsDest(s.dest);
    const w = computeShipmentWeightMetrics(s);
    let b = map.get(dest);
    if (!b) {
      b = { label: dest, ...emptyShare() };
      map.set(dest, b);
    }
    b.lots += 1;
    b.actualKg += w.actualKg;
  }
  return finalizeShares(map);
}

export function computeAirlineShares(rows: readonly Shipment[]): {
  rows: ShareRow[];
  hhiKg: number;
} {
  const map = new Map<string, { label: string; lots: number; actualKg: number }>();
  for (const s of rows) {
    const fk = normalizeFlightKey(s.flight);
    const prefix = fk ? airlinePrefixFromFlightKey(fk) : MISSING_FLIGHT_KEY;
    const w = computeShipmentWeightMetrics(s);
    let b = map.get(prefix);
    if (!b) {
      b = { label: prefix, ...emptyShare() };
      map.set(prefix, b);
    }
    b.lots += 1;
    b.actualKg += w.actualKg;
  }
  return finalizeShares(map);
}

export type CustomerDestCell = {
  customerKey: string;
  customerLabel: string;
  dest: string;
  lots: number;
  actualKg: number;
};

/** Top cells customer × dest theo kg. */
export function computeCustomerDestTop(
  rows: readonly Shipment[],
  topN = 15
): CustomerDestCell[] {
  const map = new Map<string, CustomerDestCell>();
  for (const s of rows) {
    const { key, label } = normalizeCustomerKey(s.customerCode, s.customer);
    const dest = normalizeStatsDest(s.dest);
    const cellKey = `${key}|${dest}`;
    const w = computeShipmentWeightMetrics(s);
    let cell = map.get(cellKey);
    if (!cell) {
      cell = {
        customerKey: key,
        customerLabel: label,
        dest,
        lots: 0,
        actualKg: 0,
      };
      map.set(cellKey, cell);
    }
    cell.lots += 1;
    cell.actualKg += w.actualKg;
  }
  return [...map.values()]
    .sort((a, b) => b.actualKg - a.actualKg || b.lots - a.lots)
    .slice(0, topN);
}

type DayBucket = { lots: number; actualKg: number };

function dayTotals(rows: readonly Shipment[]): DayBucket {
  let lots = 0;
  let actualKg = 0;
  for (const s of rows) {
    lots += 1;
    actualKg += computeShipmentWeightMetrics(s).actualKg;
  }
  return { lots, actualKg };
}

/**
 * Trung bình lots/kg cùng weekday trên `lookbackWeeks` phiên trước `focusYmd`
 * (chỉ các ngày có đúng DOW, trước focus).
 */
export function computeSameDowBaseline(
  historyRows: readonly Shipment[],
  focusYmd: string,
  lookbackWeeks = 8
): { baselineLots: number; baselineKg: number; sampleDays: number; dowLabel: string } {
  const dow = sessionDowIndex(focusYmd);
  const dowLabel = sessionDowLabel(focusYmd);
  if (dow == null) {
    return { baselineLots: 0, baselineKg: 0, sampleDays: 0, dowLabel };
  }

  const byDay = new Map<string, DayBucket>();
  for (const s of historyRows) {
    const day = (s.sessionDate || "").trim();
    if (!day || day >= focusYmd) continue;
    if (sessionDowIndex(day) !== dow) continue;
    let b = byDay.get(day);
    if (!b) {
      b = { lots: 0, actualKg: 0 };
      byDay.set(day, b);
    }
    b.lots += 1;
    b.actualKg += computeShipmentWeightMetrics(s).actualKg;
  }

  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a)).slice(0, lookbackWeeks);
  if (days.length === 0) {
    return { baselineLots: 0, baselineKg: 0, sampleDays: 0, dowLabel };
  }
  let lots = 0;
  let kg = 0;
  for (const d of days) {
    const b = byDay.get(d)!;
    lots += b.lots;
    kg += b.actualKg;
  }
  return {
    baselineLots: Math.round((lots / days.length) * 100) / 100,
    baselineKg: Math.round((kg / days.length) * 1000) / 1000,
    sampleDays: days.length,
    dowLabel,
  };
}

export function surgeIndex(today: number, baseline: number, eps = 0.5): number {
  const den = Math.max(baseline, eps);
  return Math.round((today / den) * 100) / 100;
}

export type FlightDestSignal = "surge" | "miss" | "normal" | "new";

export type FlightDestIntelRow = {
  flightKey: string;
  dest: string;
  lots: number;
  actualKg: number;
  baselineLots: number;
  baselineKg: number;
  surgeLots: number;
  signal: FlightDestSignal;
};

function classifySignal(todayLots: number, baselineLots: number, surge: number): FlightDestSignal {
  if (baselineLots < 0.25 && todayLots > 0) return "new";
  if (baselineLots >= 0.5 && todayLots === 0) return "miss";
  if (surge >= 1.35 && todayLots >= 2) return "surge";
  if (baselineLots >= 1 && surge <= 0.55) return "miss";
  return "normal";
}

/**
 * Agg flight×dest cho ngày focus + baseline cùng DOW (lookback tuần).
 */
export function computeFlightDestIntelligence(
  historyRows: readonly Shipment[],
  focusYmd: string,
  lookbackWeeks = 8
): FlightDestIntelRow[] {
  const dow = sessionDowIndex(focusYmd);
  const focusRows = historyRows.filter((s) => (s.sessionDate || "").trim() === focusYmd);

  const todayMap = new Map<string, { flightKey: string; dest: string; lots: number; actualKg: number }>();
  for (const s of focusRows) {
    const flightKey = normalizeFlightKey(s.flight) || MISSING_FLIGHT_KEY;
    const dest = normalizeStatsDest(s.dest);
    const k = `${flightKey}|${dest}`;
    let b = todayMap.get(k);
    if (!b) {
      b = { flightKey, dest, lots: 0, actualKg: 0 };
      todayMap.set(k, b);
    }
    b.lots += 1;
    b.actualKg += computeShipmentWeightMetrics(s).actualKg;
  }

  /** baseline: avg lots/kg per (flight×dest) trên các ngày cùng DOW trước focus */
  type Hist = { byDay: Map<string, DayBucket> };
  const histMap = new Map<string, Hist & { flightKey: string; dest: string }>();

  for (const s of historyRows) {
    const day = (s.sessionDate || "").trim();
    if (!day || day >= focusYmd) continue;
    if (dow != null && sessionDowIndex(day) !== dow) continue;
    const flightKey = normalizeFlightKey(s.flight) || MISSING_FLIGHT_KEY;
    const dest = normalizeStatsDest(s.dest);
    const k = `${flightKey}|${dest}`;
    let h = histMap.get(k);
    if (!h) {
      h = { flightKey, dest, byDay: new Map() };
      histMap.set(k, h);
    }
    let d = h.byDay.get(day);
    if (!d) {
      d = { lots: 0, actualKg: 0 };
      h.byDay.set(day, d);
    }
    d.lots += 1;
    d.actualKg += computeShipmentWeightMetrics(s).actualKg;
  }

  const keys = new Set([...todayMap.keys(), ...histMap.keys()]);
  const rows: FlightDestIntelRow[] = [];

  for (const k of keys) {
    const today = todayMap.get(k) ?? {
      flightKey: k.split("|")[0]!,
      dest: k.split("|")[1]!,
      lots: 0,
      actualKg: 0,
    };
    const hist = histMap.get(k);
    let baselineLots = 0;
    let baselineKg = 0;
    if (hist) {
      const days = [...hist.byDay.keys()].sort((a, b) => b.localeCompare(a)).slice(0, lookbackWeeks);
      if (days.length > 0) {
        let lots = 0;
        let kg = 0;
        for (const d of days) {
          const b = hist.byDay.get(d)!;
          lots += b.lots;
          kg += b.actualKg;
        }
        baselineLots = Math.round((lots / days.length) * 100) / 100;
        baselineKg = Math.round((kg / days.length) * 1000) / 1000;
      }
    }
    const surgeLots = surgeIndex(today.lots, baselineLots);
    rows.push({
      flightKey: today.flightKey,
      dest: today.dest,
      lots: today.lots,
      actualKg: Math.round(today.actualKg * 1000) / 1000,
      baselineLots,
      baselineKg,
      surgeLots,
      signal: classifySignal(today.lots, baselineLots, surgeLots),
    });
  }

  return rows.sort(
    (a, b) =>
      (b.signal === "surge" ? 2 : b.signal === "miss" ? 1 : 0) -
        (a.signal === "surge" ? 2 : a.signal === "miss" ? 1 : 0) ||
      b.lots - a.lots ||
      b.actualKg - a.actualKg
  );
}

/** 2–4 câu insight tiếng Việt từ baseline + flight×dest. */
export function buildBookingInsights(opts: {
  focusYmd: string;
  focusTotals: DayBucket;
  baseline: ReturnType<typeof computeSameDowBaseline>;
  flightDest: readonly FlightDestIntelRow[];
}): string[] {
  const { focusYmd, focusTotals, baseline, flightDest } = opts;
  const lines: string[] = [];
  const dow = baseline.dowLabel;

  if (baseline.sampleDays >= 2) {
    const surge = surgeIndex(focusTotals.lots, baseline.baselineLots);
    const pct =
      baseline.baselineLots > 0
        ? Math.round((focusTotals.lots / baseline.baselineLots - 1) * 100)
        : focusTotals.lots > 0
          ? 100
          : 0;
    if (surge >= 1.2) {
      lines.push(
        `${focusYmd} (${dow}): ${focusTotals.lots} lô — cao hơn cùng ${dow} trung bình ${baseline.baselineLots} lô (~${pct > 0 ? "+" : ""}${pct}%, n=${baseline.sampleDays}).`
      );
    } else if (surge <= 0.7 && baseline.baselineLots >= 1) {
      lines.push(
        `${focusYmd} (${dow}): ${focusTotals.lots} lô — thấp hơn cùng ${dow} TB ${baseline.baselineLots} lô (${pct}%, n=${baseline.sampleDays}) — kiểm tra booking còn thiếu.`
      );
    } else {
      lines.push(
        `${focusYmd} (${dow}): ${focusTotals.lots} lô ≈ TB cùng ${dow} (${baseline.baselineLots} lô, n=${baseline.sampleDays}).`
      );
    }
  } else if (focusTotals.lots > 0) {
    lines.push(
      `${focusYmd}: ${focusTotals.lots} lô · ${Math.round(focusTotals.actualKg)} kg — chưa đủ lịch sử cùng ${dow} để so baseline.`
    );
  }

  const surges = flightDest.filter((r) => r.signal === "surge").slice(0, 2);
  for (const r of surges) {
    const pct = Math.round((r.surgeLots - 1) * 100);
    lines.push(
      `${r.flightKey} ${r.dest}: ${r.lots} lô ${focusYmd} — cao hơn cùng ${dow} TB ~${pct}% (baseline ${r.baselineLots} lô) — cân nhắc tăng booking.`
    );
  }

  const misses = flightDest.filter((r) => r.signal === "miss" && r.baselineLots >= 1).slice(0, 2);
  for (const r of misses) {
    lines.push(
      `${r.flightKey} ${r.dest}: thường ~${r.baselineLots} lô cùng ${dow} nhưng ${focusYmd} ${r.lots} — rủi ro miss booking / mất share.`
    );
  }

  const destConc = new Map<string, number>();
  for (const r of flightDest) {
    if (r.lots > 0) destConc.set(r.dest, (destConc.get(r.dest) ?? 0) + r.lots);
  }
  const destSorted = [...destConc.entries()].sort((a, b) => b[1] - a[1]);
  const totalFocusLots = focusTotals.lots || 1;
  if (destSorted[0] && destSorted[0][1] / totalFocusLots >= 0.45 && destSorted.length >= 2) {
    const [d, n] = destSorted[0];
    lines.push(
      `Dest ${d} chiếm ${n}/${focusTotals.lots} lô (~${Math.round((n / totalFocusLots) * 100)}%) — cân nhắc diversify tuyến phụ.`
    );
  }

  return lines.slice(0, 4);
}

export type OpsStatsIntelligence = {
  focusYmd: string;
  statusMix: StatusMixRow[];
  volumeDonePct: number;
  alerts: OpsStatsAlert[];
  customerShare: ReturnType<typeof computeCustomerShares>;
  destShare: ReturnType<typeof computeDestShares>;
  airlineShare: ReturnType<typeof computeAirlineShares>;
  customerDestTop: CustomerDestCell[];
  baseline: ReturnType<typeof computeSameDowBaseline>;
  focusDayTotals: DayBucket;
  flightDest: FlightDestIntelRow[];
  insights: string[];
};

/**
 * Compose intelligence cho dashboard.
 * `periodRows` = đã filter kỳ + filters UI.
 * `historyRows` = rows dùng baseline (thường cùng filter kho/dest/khách/chuyến, không cắt kỳ).
 */
export function computeOpsStatsIntelligence(
  periodRows: readonly Shipment[],
  historyRows: readonly Shipment[],
  focusYmd: string,
  lookbackWeeks = 8
): OpsStatsIntelligence {
  const focusDayRows = historyRows.filter((s) => (s.sessionDate || "").trim() === focusYmd);
  const focusDayTotals = dayTotals(focusDayRows);
  const baseline = computeSameDowBaseline(historyRows, focusYmd, lookbackWeeks);
  const flightDest = computeFlightDestIntelligence(historyRows, focusYmd, lookbackWeeks);
  const insights = buildBookingInsights({
    focusYmd,
    focusTotals: focusDayTotals,
    baseline,
    flightDest,
  });

  return {
    focusYmd,
    statusMix: computeStatusMix(periodRows),
    volumeDonePct: computeVolumeDonePct(periodRows),
    alerts: collectOpsStatsAlerts(periodRows),
    customerShare: computeCustomerShares(periodRows),
    destShare: computeDestShares(periodRows),
    airlineShare: computeAirlineShares(periodRows),
    customerDestTop: computeCustomerDestTop(periodRows),
    baseline,
    focusDayTotals,
    flightDest,
    insights,
  };
}

/** Options khách trong tập rows (đã lọc kỳ/kho…). */
export function listCustomerOptionsInRows(rows: readonly Shipment[]): { key: string; label: string }[] {
  const map = new Map<string, string>();
  for (const s of rows) {
    const { key, label } = normalizeCustomerKey(s.customerCode, s.customer);
    if (!map.has(key)) map.set(key, label);
  }
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Options chuyến đã normalize. */
export function listFlightOptionsInRows(rows: readonly Shipment[]): string[] {
  const set = new Set<string>();
  let hasMissing = false;
  for (const s of rows) {
    const k = normalizeFlightKey(s.flight);
    if (k) set.add(k);
    else hasMissing = true;
  }
  const out = [...set].sort((a, b) => a.localeCompare(b));
  if (hasMissing) out.unshift(MISSING_FLIGHT_KEY);
  return out;
}

/** Ô tìm bảng lô — `(không AWB)` khớp lô trống AWB. */
export function shipmentMatchesStatsLotSearch(
  shipment: Shipment,
  raw: string,
  ctx: ShipmentSearchContext
): boolean {
  const q = raw.trim();
  if (!q) return true;
  if (q === MISSING_AWB_LABEL) return !(shipment.awb || "").trim();
  return shipmentMatchesSearchQuery(shipment, q, ctx);
}

/** Filter phụ trợ cho page (customer / flight / status). */
export function filterShipmentsForStatsIntel(
  rows: readonly Shipment[],
  opts: {
    customerKey?: string | "ALL";
    flightKey?: string | "ALL";
    statuses?: readonly ShipmentStatus[] | "ALL";
  }
): Shipment[] {
  const cust = opts.customerKey ?? "ALL";
  const flight = opts.flightKey ?? "ALL";
  const statuses = opts.statuses ?? "ALL";
  return rows.filter((s) => {
    if (cust !== "ALL") {
      const { key } = normalizeCustomerKey(s.customerCode, s.customer);
      if (key !== cust) return false;
    }
    if (flight !== "ALL") {
      const fk = normalizeFlightKey(s.flight);
      if (flight === MISSING_FLIGHT_KEY) {
        if (fk) return false;
      } else if (fk !== flight) {
        return false;
      }
    }
    if (statuses !== "ALL" && statuses.length > 0) {
      if (!statuses.includes(s.status)) return false;
    }
    return true;
  });
}
