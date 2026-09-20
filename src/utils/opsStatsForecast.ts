import type { Shipment } from "../types/shipment";
import {
  addLocalDays,
  formatLocalSessionDate,
  parseSessionDateYmd,
} from "./sessionDate";
import {
  computeSameDowBaseline,
  normalizeCustomerKey,
  normalizeFlightKey,
  sessionDowLabel,
  type FlightDestIntelRow,
} from "./opsStatsIntelligence";
import {
  computeShipmentWeightMetrics,
  normalizeStatsDest,
} from "./opsStatsMetrics";
import { weekStartYmd } from "./opsStatsPeriod";

export type NextWeekLaneSuggestion = {
  ymd: string;
  dowLabel: string;
  flightKey: string;
  dest: string;
  baselineLots: number;
  baselineKg: number;
  sampleDays: number;
  insight: string;
};

export type ForecastDayRow = {
  ymd: string;
  dowLabel: string;
  forecastLots: number;
  forecastKg: number;
  sampleDays: number;
  confidence: "low" | "mid" | "high";
};

export type ShareSparkPoint = {
  weekStart: string;
  shareKgPct: number;
  actualKg: number;
};

/** 7 ngày tới: tomorrow … tomorrow+6 tính từ `fromYmd`. */
export function nextSevenYmds(fromYmd: string): string[] {
  const base = parseSessionDateYmd(fromYmd);
  const out: string[] = [];
  for (let i = 1; i <= 7; i++) {
    out.push(formatLocalSessionDate(addLocalDays(base, i)));
  }
  return out;
}

function confidenceFromN(n: number): ForecastDayRow["confidence"] {
  if (n >= 4) return "high";
  if (n >= 2) return "mid";
  return "low";
}

/** Forecast naive: lots/kg = baseline cùng DOW. Bỏ ngày sampleDays &lt; 2. */
export function computeSevenDayForecast(
  historyRows: readonly Shipment[],
  todayYmd: string,
  lookbackWeeks = 8
): ForecastDayRow[] {
  const days = nextSevenYmds(todayYmd);
  const rows: ForecastDayRow[] = [];
  for (const ymd of days) {
    const b = computeSameDowBaseline(historyRows, ymd, lookbackWeeks);
    if (b.sampleDays < 2) continue;
    rows.push({
      ymd,
      dowLabel: b.dowLabel,
      forecastLots: b.baselineLots,
      forecastKg: b.baselineKg,
      sampleDays: b.sampleDays,
      confidence: confidenceFromN(b.sampleDays),
    });
  }
  return rows;
}

type LaneKey = string;

function laneKey(flightKey: string, dest: string): LaneKey {
  return `${flightKey}|${dest}`;
}

/**
 * Gợi ý tuần tới: mỗi ngày trong 7 ngày tới → top flight×dest theo baseline DOW (n≥2).
 */
export function computeNextWeekLaneSuggestions(
  historyRows: readonly Shipment[],
  todayYmd: string,
  opts?: { lookbackWeeks?: number; topPerDay?: number; maxTotal?: number }
): NextWeekLaneSuggestion[] {
  const lookbackWeeks = opts?.lookbackWeeks ?? 8;
  const topPerDay = opts?.topPerDay ?? 3;
  const maxTotal = opts?.maxTotal ?? 12;
  const days = nextSevenYmds(todayYmd);
  const suggestions: NextWeekLaneSuggestion[] = [];

  for (const ymd of days) {
    const dow = sessionDowLabel(ymd);
    type Acc = {
      flightKey: string;
      dest: string;
      byDay: Map<string, { lots: number; kg: number }>;
    };
    const map = new Map<LaneKey, Acc>();

    for (const s of historyRows) {
      const day = (s.sessionDate || "").trim();
      if (!day || day >= ymd) continue;
      if (sessionDowLabel(day) !== dow) continue;
      const fk = normalizeFlightKey(s.flight) || "(chưa có)";
      const dest = normalizeStatsDest(s.dest);
      const k = laneKey(fk, dest);
      let acc = map.get(k);
      if (!acc) {
        acc = { flightKey: fk, dest, byDay: new Map() };
        map.set(k, acc);
      }
      const w = computeShipmentWeightMetrics(s);
      let d = acc.byDay.get(day);
      if (!d) {
        d = { lots: 0, kg: 0 };
        acc.byDay.set(day, d);
      }
      d.lots += 1;
      d.kg += w.actualKg;
    }

    const ranked = [...map.values()]
      .map((acc) => {
        const daysList = [...acc.byDay.keys()]
          .sort((a, b) => b.localeCompare(a))
          .slice(0, lookbackWeeks);
        if (daysList.length < 2) return null;
        let lots = 0;
        let kg = 0;
        for (const d of daysList) {
          const x = acc.byDay.get(d)!;
          lots += x.lots;
          kg += x.kg;
        }
        const baselineLots = Math.round((lots / daysList.length) * 100) / 100;
        const baselineKg = Math.round((kg / daysList.length) * 1000) / 1000;
        return {
          ymd,
          dowLabel: dow,
          flightKey: acc.flightKey,
          dest: acc.dest,
          baselineLots,
          baselineKg,
          sampleDays: daysList.length,
          insight: `${dow} ${ymd}: ${acc.flightKey} ${acc.dest} thường ~${baselineLots} lô — ưu tiên giữ slot`,
        } satisfies NextWeekLaneSuggestion;
      })
      .filter((x): x is NextWeekLaneSuggestion => x != null)
      .sort((a, b) => b.baselineLots - a.baselineLots || b.baselineKg - a.baselineKg)
      .slice(0, topPerDay);

    suggestions.push(...ranked);
  }

  return suggestions
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || b.baselineLots - a.baselineLots)
    .slice(0, maxTotal);
}

export function pickMissLanes(
  flightDest: readonly FlightDestIntelRow[],
  limit = 8
): FlightDestIntelRow[] {
  return flightDest
    .filter((r) => r.signal === "miss" && r.baselineLots >= 1)
    .slice(0, limit);
}

/**
 * Share kg % theo tuần ISO (T2) cho customer key hoặc dest.
 * Chỉ trả điểm tuần có totalKg &gt; 0; UI ẩn sparkline nếu &lt; 4 điểm.
 */
export function computeWeeklyShareSparkline(
  historyRows: readonly Shipment[],
  opts: {
    kind: "customer" | "dest";
    matchKey: string;
    weeks?: number;
    beforeYmd: string;
  }
): ShareSparkPoint[] {
  const weeks = opts.weeks ?? 8;
  const before = formatLocalSessionDate(
    addLocalDays(parseSessionDateYmd(opts.beforeYmd), -1)
  );
  let cursor = weekStartYmd(before);
  if (!cursor) return [];

  const weekStarts: string[] = [];
  for (let i = 0; i < weeks; i++) {
    weekStarts.push(cursor);
    cursor = formatLocalSessionDate(addLocalDays(parseSessionDateYmd(cursor), -7));
  }
  weekStarts.reverse();

  const points: ShareSparkPoint[] = [];
  for (const ws of weekStarts) {
    const we = formatLocalSessionDate(addLocalDays(parseSessionDateYmd(ws), 6));
    let totalKg = 0;
    let entityKg = 0;
    for (const s of historyRows) {
      const day = (s.sessionDate || "").trim();
      if (!day || day < ws || day > we) continue;
      const kg = computeShipmentWeightMetrics(s).actualKg;
      totalKg += kg;
      if (opts.kind === "dest") {
        if (normalizeStatsDest(s.dest) === opts.matchKey) entityKg += kg;
      } else {
        const { key } = normalizeCustomerKey(s.customerCode, s.customer);
        if (key === opts.matchKey) entityKg += kg;
      }
    }
    if (totalKg <= 0) continue;
    points.push({
      weekStart: ws,
      shareKgPct: Math.round((entityKg / totalKg) * 1000) / 10,
      actualKg: Math.round(entityKg * 1000) / 1000,
    });
  }
  return points;
}
