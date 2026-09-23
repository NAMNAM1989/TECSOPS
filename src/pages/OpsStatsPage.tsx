import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SyncStatus } from "../hooks/useShipmentSync";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { WarehouseLayoutFilter } from "../constants/warehouses";
import { normalizeWarehouse, warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
import {
  AppShell,
  Button,
  EmptyState,
  IconButton,
  SyncStatusPill,
  Wordmark,
  useToast,
} from "../ui";
import { statusLabel } from "../components/statusStyles";
import { formatKgTotal } from "../utils/formatKgTotal";
import { statusOrderForFilter } from "../utils/shipmentWorkflowStatus";
import {
  computeOpsStats,
  listDestOptionsInRange,
  normalizeStatsDest,
} from "../utils/opsStatsMetrics";
import {
  computeOpsStatsIntelligence,
  filterShipmentsForStatsIntel,
  listCustomerOptionsInRows,
  listFlightOptionsInRows,
  MISSING_AWB_LABEL,
  shipmentMatchesStatsLotSearch,
} from "../utils/opsStatsIntelligence";
import {
  computeSevenDayForecast,
  computeNextWeekLaneSuggestions,
  computeWeeklyShareSparkline,
  pickMissLanes,
} from "../utils/opsStatsForecast";
import {
  parseLotSortParam,
  serializeLotSortParam,
  toggleLotSort,
  type LotSortState,
} from "../utils/opsStatsLotSort";
import {
  formatPctDeltaLabel,
  formatStatsPeriodLabel,
  formatWeekEmptyCopy,
  formatWeekRangeLabel,
  pctDelta,
  previousStatsPeriodRange,
  resolveStatsPeriodRange,
  shiftStatsPeriodAnchor,
  todayYmdAsiaSaigon,
  weekStartYmd,
  type StatsPeriodMode,
} from "../utils/opsStatsPeriod";
import {
  parseOpsStatsUrlState,
  replaceStatsHash,
  type OpsStatsDetailTab,
  type OpsStatsIntelTab,
  type OpsStatsUrlState,
} from "../utils/opsStatsUrlState";
import { filterShipmentsBySessionYmdRange } from "../utils/filterShipmentsBySessionYmd";
import { type ShipmentSearchContext } from "../utils/shipmentSearch";
import { StatsKpiStrip, formatStatsPct } from "../components/opsStats/StatsKpiStrip";
import { OpsStatsActiveFilterBar } from "../components/opsStats/OpsStatsActiveFilterBar";
import { OpsStatsBookingPanel } from "../components/opsStats/OpsStatsBookingPanel";
import { OpsStatsMarketPanel } from "../components/opsStats/OpsStatsMarketPanel";
import { OpsStatsAlertList } from "../components/opsStats/OpsStatsAlertList";
import {
  AggTable,
  FilterField,
  LotsDetailTable,
  mapDayAgg,
  mapDestAgg,
  mapWhAgg,
} from "../components/opsStats/OpsStatsDetailTables";

const OpsStatsChartsPanel = lazy(() =>
  import("../components/OpsStatsChartsPanel").then((m) => ({
    default: m.OpsStatsChartsPanel,
  }))
);

type Props = {
  rows: readonly Shipment[];
  customers?: readonly CustomerDirectoryEntry[];
  ready: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  onNavigateOps: () => void;
  onNavigateCustomers: () => void;
  onOpenLot?: (opts: {
    sessionYmd: string;
    query: string;
    shipmentId?: string;
  }) => void;
};

type DetailTab = OpsStatsDetailTab;
type IntelTab = OpsStatsIntelTab;

const PERIOD_MODES: { id: StatsPeriodMode; label: string }[] = [
  { id: "today", label: "Hôm nay" },
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
  { id: "year", label: "Năm" },
  { id: "range", label: "Khoảng" },
];

const INTEL_TABS: { id: IntelTab; label: string }[] = [
  { id: "ops", label: "Vận hành" },
  { id: "booking", label: "Booking" },
  { id: "market", label: "Thị trường" },
  { id: "alerts", label: "Cảnh báo" },
];

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "lots", label: "Chi tiết lô" },
  { id: "day", label: "Theo ngày" },
  { id: "warehouse", label: "Theo kho" },
  { id: "dest", label: "Theo dest" },
];

const FIELD =
  "min-h-9 rounded-lg border border-ui-border/80 bg-ui-surface px-2.5 py-1.5 text-sm text-ui-text outline-none transition focus:border-ui-primary/45 focus:ring-2 focus:ring-ui-focus/80";

const STATUS_FILTER_OPTIONS = statusOrderForFilter("ALL");

function warehouseFilterLabel(w: WarehouseLayoutFilter): string {
  return w === "ALL" ? "Tất cả kho" : warehouseLabel[w];
}

function readUrlPartial(): Partial<OpsStatsUrlState> {
  if (typeof window === "undefined") return {};
  return parseOpsStatsUrlState(window.location.hash);
}

function kpiDelta(current: number, previous: number) {
  const d = pctDelta(current, previous);
  const deltaLabel = formatPctDeltaLabel(d, current, previous);
  const deltaPositive =
    (d != null && d > 0) || (previous === 0 && current > 0);
  return { deltaLabel, deltaPositive };
}

function SegmentedTabs<T extends string>({
  ariaLabel,
  tabs,
  value,
  onChange,
  counts,
}: {
  ariaLabel: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative min-h-10 shrink-0 px-3 text-[12px] font-bold transition ${
              active ? "text-ui-navy" : "text-ui-text-muted hover:text-ui-text"
            }`}
          >
            {tab.label}
            {count != null ? (
              <span
                className={`ml-1.5 tabular-nums ${
                  active ? "text-teal-700" : "text-ui-text-muted/80"
                }`}
              >
                {count}
              </span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ui-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function OpsStatsPage({
  rows,
  customers = [],
  ready,
  syncStatus,
  socketConnected,
  onNavigateOps,
  onNavigateCustomers,
  onOpenLot,
}: Props) {
  const toast = useToast();
  const today = todayYmdAsiaSaigon();
  const url0 = useMemo(() => readUrlPartial(), []);

  const [mode, setMode] = useState<StatsPeriodMode>(() => url0.mode ?? "today");
  const [dayYmd, setDayYmd] = useState(() => url0.dayYmd ?? today);
  const [weekYmd, setWeekYmd] = useState(() => url0.weekYmd ?? today);
  const [monthYm, setMonthYm] = useState(() => url0.monthYm ?? today.slice(0, 7));
  const [year, setYear] = useState(() => url0.year ?? Number(today.slice(0, 4)));
  const [rangeFrom, setRangeFrom] = useState(() => url0.rangeFrom ?? today);
  const [rangeTo, setRangeTo] = useState(() => url0.rangeTo ?? today);
  const [warehouse, setWarehouse] = useState<WarehouseLayoutFilter>(
    () => url0.warehouse ?? "ALL"
  );
  const [dest, setDest] = useState<string | "ALL">(() => url0.dest ?? "ALL");
  const [customerKey, setCustomerKey] = useState<string | "ALL">(
    () => url0.customerKey ?? "ALL"
  );
  const [flightKey, setFlightKey] = useState<string | "ALL">(
    () => url0.flightKey ?? "ALL"
  );
  const [statuses, setStatuses] = useState<ShipmentStatus[] | "ALL">(
    () => url0.statuses ?? "ALL"
  );
  const [exporting, setExporting] = useState(false);
  const [intelTab, setIntelTab] = useState<IntelTab>(() => url0.intelTab ?? "ops");
  const [detailTab, setDetailTab] = useState<DetailTab>(
    () => url0.detailTab ?? "lots"
  );
  const [lotSearch, setLotSearch] = useState("");
  const [focusYmdOverride, setFocusYmdOverride] = useState<string | null>(
    () => url0.focusYmd ?? null
  );
  const [lotSort, setLotSort] = useState<LotSortState>(() =>
    parseLotSortParam(url0.sort)
  );

  const range = useMemo(
    () =>
      resolveStatsPeriodRange({
        mode,
        dayYmd,
        weekYmd,
        monthYm,
        year,
        rangeFromYmd: rangeFrom,
        rangeToYmd: rangeTo,
        todayYmd: today,
      }),
    [mode, dayYmd, weekYmd, monthYm, year, rangeFrom, rangeTo, today]
  );

  const focusYmd = useMemo(() => {
    if (focusYmdOverride) return focusYmdOverride;
    if (today >= range.fromYmd && today <= range.toYmd) return today;
    return range.toYmd;
  }, [focusYmdOverride, today, range.fromYmd, range.toYmd]);

  const periodKey = `${mode}|${dayYmd}|${weekYmd}|${monthYm}|${year}|${rangeFrom}|${rangeTo}`;
  const periodKeyRef = useRef(periodKey);
  useEffect(() => {
    if (periodKeyRef.current === periodKey) return;
    periodKeyRef.current = periodKey;
    setFocusYmdOverride(null);
  }, [periodKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      replaceStatsHash({
        mode,
        dayYmd,
        weekYmd,
        monthYm,
        year,
        rangeFrom,
        rangeTo,
        warehouse,
        dest,
        customerKey,
        flightKey,
        statuses,
        intelTab,
        detailTab,
        focusYmd: focusYmdOverride ?? "",
        sort: serializeLotSortParam(lotSort),
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    mode,
    dayYmd,
    weekYmd,
    monthYm,
    year,
    rangeFrom,
    rangeTo,
    warehouse,
    dest,
    customerKey,
    flightKey,
    statuses,
    intelTab,
    detailTab,
    focusYmdOverride,
    lotSort,
  ]);

  const inRangeWh = useMemo(() => {
    const inRange = filterShipmentsBySessionYmdRange(rows, range.fromYmd, range.toYmd);
    if (warehouse === "ALL") return inRange;
    return inRange.filter((r) => normalizeWarehouse(r.warehouse) === warehouse);
  }, [rows, range.fromYmd, range.toYmd, warehouse]);

  const destOptions = useMemo(
    () =>
      listDestOptionsInRange(rows, {
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        warehouse,
      }),
    [rows, range.fromYmd, range.toYmd, warehouse]
  );

  const customerOptions = useMemo(() => listCustomerOptionsInRows(inRangeWh), [inRangeWh]);
  const flightOptions = useMemo(() => listFlightOptionsInRows(inRangeWh), [inRangeWh]);

  useEffect(() => {
    if (!ready) return;
    if (dest !== "ALL" && destOptions.length > 0 && !destOptions.includes(dest)) {
      setDest("ALL");
    }
  }, [ready, dest, destOptions]);
  useEffect(() => {
    if (!ready) return;
    if (
      customerKey !== "ALL" &&
      customerOptions.length > 0 &&
      !customerOptions.some((c) => c.key === customerKey)
    ) {
      setCustomerKey("ALL");
    }
  }, [ready, customerKey, customerOptions]);
  useEffect(() => {
    if (!ready) return;
    if (flightKey !== "ALL" && flightOptions.length > 0 && !flightOptions.includes(flightKey)) {
      setFlightKey("ALL");
    }
  }, [ready, flightKey, flightOptions]);

  const scopedPeriodRows = useMemo(() => {
    let base = inRangeWh;
    if (dest !== "ALL") {
      base = base.filter((r) => normalizeStatsDest(r.dest) === dest);
    }
    return filterShipmentsForStatsIntel(base, {
      customerKey,
      flightKey,
      statuses,
    });
  }, [inRangeWh, dest, customerKey, flightKey, statuses]);

  const stats = useMemo(
    () =>
      computeOpsStats(scopedPeriodRows, {
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        warehouse: "ALL",
        dest: "ALL",
      }),
    [scopedPeriodRows, range.fromYmd, range.toYmd]
  );

  const prevRange = useMemo(
    () => previousStatsPeriodRange(range, mode),
    [range, mode]
  );

  const prevScopedRows = useMemo(() => {
    let base = filterShipmentsBySessionYmdRange(
      rows,
      prevRange.fromYmd,
      prevRange.toYmd
    );
    if (warehouse !== "ALL") {
      base = base.filter((r) => normalizeWarehouse(r.warehouse) === warehouse);
    }
    if (dest !== "ALL") {
      base = base.filter((r) => normalizeStatsDest(r.dest) === dest);
    }
    return filterShipmentsForStatsIntel(base, {
      customerKey,
      flightKey,
      statuses,
    });
  }, [rows, prevRange.fromYmd, prevRange.toYmd, warehouse, dest, customerKey, flightKey, statuses]);

  const prevStats = useMemo(
    () =>
      computeOpsStats(prevScopedRows, {
        fromYmd: prevRange.fromYmd,
        toYmd: prevRange.toYmd,
        warehouse: "ALL",
        dest: "ALL",
      }),
    [prevScopedRows, prevRange.fromYmd, prevRange.toYmd]
  );

  const historyRows = useMemo(() => {
    let base: Shipment[] =
      warehouse === "ALL"
        ? [...rows]
        : rows.filter((r) => normalizeWarehouse(r.warehouse) === warehouse);
    if (dest !== "ALL") {
      base = base.filter((r) => normalizeStatsDest(r.dest) === dest);
    }
    return filterShipmentsForStatsIntel(base, {
      customerKey,
      flightKey,
      statuses,
    });
  }, [rows, warehouse, dest, customerKey, flightKey, statuses]);

  const intel = useMemo(
    () => computeOpsStatsIntelligence(stats.filtered, historyRows, focusYmd, 8),
    [stats.filtered, historyRows, focusYmd]
  );

  const missLanes = useMemo(
    () => pickMissLanes(intel.flightDest),
    [intel.flightDest]
  );
  const nextWeek = useMemo(
    () => computeNextWeekLaneSuggestions(historyRows, today),
    [historyRows, today]
  );
  const forecast = useMemo(
    () => computeSevenDayForecast(historyRows, today),
    [historyRows, today]
  );

  const sparkByCustomerKey = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeWeeklyShareSparkline>> = {};
    for (const row of intel.customerShare.rows.slice(0, 5)) {
      out[row.key] = computeWeeklyShareSparkline(historyRows, {
        kind: "customer",
        matchKey: row.key,
        beforeYmd: today,
      });
    }
    return out;
  }, [intel.customerShare.rows, historyRows, today]);

  const sparkByDestKey = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeWeeklyShareSparkline>> = {};
    for (const row of intel.destShare.rows.slice(0, 5)) {
      out[row.key] = computeWeeklyShareSparkline(historyRows, {
        kind: "dest",
        matchKey: row.key,
        beforeYmd: today,
      });
    }
    return out;
  }, [intel.destShare.rows, historyRows, today]);

  const periodLabel = formatStatsPeriodLabel(range, mode);
  const weekLabel = formatWeekRangeLabel(range.fromYmd, range.toYmd);
  const isCurrentWeek =
    mode === "week" && weekStartYmd(weekYmd) === weekStartYmd(today);

  const searchContext = useMemo(
    (): ShipmentSearchContext => ({ customers }),
    [customers]
  );

  const filteredLots = useMemo(() => {
    const q = lotSearch.trim();
    if (!q) return stats.lots;
    return stats.lots.filter((lot) =>
      shipmentMatchesStatsLotSearch(lot.shipment, q, searchContext)
    );
  }, [stats.lots, lotSearch, searchContext]);

  const activeFilterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];
    if (warehouse !== "ALL") {
      chips.push({
        id: "wh",
        label: warehouseFilterLabel(warehouse),
        onClear: () => setWarehouse("ALL"),
      });
    }
    if (dest !== "ALL") {
      chips.push({
        id: "dest",
        label: `Dest ${dest}`,
        onClear: () => setDest("ALL"),
      });
    }
    if (customerKey !== "ALL") {
      const custLabel =
        customerOptions.find((c) => c.key === customerKey)?.label ?? customerKey;
      chips.push({
        id: "cust",
        label: custLabel,
        onClear: () => setCustomerKey("ALL"),
      });
    }
    if (flightKey !== "ALL") {
      chips.push({
        id: "flight",
        label: `Chuyến ${flightKey}`,
        onClear: () => setFlightKey("ALL"),
      });
    }
    if (statuses !== "ALL") {
      chips.push({
        id: "st",
        label: statuses.map((s) => statusLabel[s] ?? s).join(", "),
        onClear: () => setStatuses("ALL"),
      });
    }
    if (mode === "day") {
      chips.push({
        id: "day",
        label: `Ngày ${dayYmd}`,
        onClear: () => {
          setMode("today");
        },
      });
    }
    return chips;
  }, [
    warehouse,
    dest,
    customerKey,
    flightKey,
    statuses,
    mode,
    dayYmd,
    customerOptions,
  ]);

  const clearAllFilters = useCallback(() => {
    setWarehouse("ALL");
    setDest("ALL");
    setCustomerKey("ALL");
    setFlightKey("ALL");
    setStatuses("ALL");
    if (mode === "day") setMode("today");
  }, [mode]);

  const dayAggRows = useMemo(() => mapDayAgg(stats.byDay), [stats.byDay]);
  const whAggRows = useMemo(() => mapWhAgg(stats.byWarehouse), [stats.byWarehouse]);
  const destAggRows = useMemo(() => mapDestAgg(stats.byDest), [stats.byDest]);

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      const { downloadOpsStatsExcel } = await import("../utils/exportOpsStatsExcel");
      await downloadOpsStatsExcel({
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        mode,
        warehouseLabel: warehouseFilterLabel(warehouse),
        destLabel: dest === "ALL" ? "Tất cả" : dest,
        totals: stats.totals,
        byDay: stats.byDay,
        byWarehouse: stats.byWarehouse,
        byDest: stats.byDest,
        lots: stats.lots,
        intelligence: intel,
        filterMeta: {
          Khách: customerKey === "ALL" ? "Tất cả" : customerKey,
          Chuyến: flightKey === "ALL" ? "Tất cả" : flightKey,
          "Trạng thái":
            statuses === "ALL"
              ? "Tất cả"
              : statuses.map((s) => statusLabel[s] ?? s).join(", "),
        },
      });
      toast.success("Đã xuất Excel thống kê");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất Excel thất bại");
    } finally {
      setExporting(false);
    }
  }, [customerKey, dest, flightKey, intel, mode, range, stats, statuses, toast, warehouse]);

  const toggleStatus = useCallback((s: ShipmentStatus) => {
    setStatuses((prev) => {
      if (prev === "ALL") return [s];
      if (prev.includes(s)) {
        const next = prev.filter((x) => x !== s);
        return next.length === 0 ? "ALL" : next;
      }
      return [...prev, s];
    });
  }, []);

  const t = stats.totals;
  const pt = prevStats.totals;
  const lotsDelta = kpiDelta(t.lots, pt.lots);
  const pcsDelta = kpiDelta(t.pcs, pt.pcs);
  const actualDelta = kpiDelta(t.actualKg, pt.actualKg);
  const cwDelta = kpiDelta(t.chargeableKg, pt.chargeableKg);
  const deltaPositive = t.deltaKg > 0;
  const statusMixHint = intel.statusMix
    .slice(0, 3)
    .map((m) => `${statusLabel[m.status] ?? m.status} ${m.pct}%`)
    .join(" · ");

  const openLotFromAlert = useCallback(
    (sessionYmd: string, awb: string, shipmentId?: string) => {
      if (!onOpenLot) return;
      const q = awb.trim();
      onOpenLot({
        sessionYmd,
        query: q && q !== MISSING_AWB_LABEL ? q : "",
        shipmentId,
      });
    },
    [onOpenLot]
  );

  return (
    <div className="min-h-screen bg-ui-background" data-testid="ops-stats-page">
      <AppShell
        chrome={
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="m-0 leading-none">
                  <Wordmark size="md" />
                </h1>
                <span className="text-ui-text-muted">·</span>
                <div className="min-w-0">
                  <span className="block text-[13px] font-extrabold tracking-tight text-ui-navy">
                    Thống kê vận hành & booking
                  </span>
                  <span className="hidden text-[11px] text-ui-text-muted sm:block">
                    Control · Booking intelligence · Share nội bộ
                  </span>
                </div>
                <SyncStatusPill status={syncStatus} socketConnected={socketConnected} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="md:hidden"
                  onClick={onNavigateOps}
                >
                  ← Ops
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden"
                  onClick={onNavigateCustomers}
                >
                  Khách
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={exporting || !ready}
                  onClick={() => void onExport()}
                >
                  {exporting ? "Đang xuất…" : "Xuất Excel"}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
              <div
                aria-label="Bộ lọc kỳ"
                className="flex gap-0.5 overflow-x-auto border-b border-ui-border/70 bg-slate-50/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
              >
                {PERIOD_MODES.map((p) => {
                  const active = mode === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMode(p.id)}
                      className={`min-h-9 shrink-0 rounded-xl px-3 text-[12px] font-bold transition ${
                        active
                          ? "bg-ui-navy text-white shadow-ui-sm"
                          : "text-ui-text-muted hover:bg-white hover:text-ui-text"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5 px-3 py-3 sm:px-3.5">
                {mode === "day" ? (
                  <FilterField label="Ngày">
                    <input
                      type="date"
                      className={FIELD}
                      value={dayYmd}
                      onChange={(e) => setDayYmd(e.target.value || today)}
                    />
                  </FilterField>
                ) : null}
                {mode === "week" ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
                      Tuần T2–CN
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex items-center rounded-lg border border-ui-border/80 bg-ui-surface p-0.5">
                        <IconButton
                          label="Tuần trước"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setWeekYmd((w) => shiftStatsPeriodAnchor("week", w, -1))
                          }
                        >
                          ‹
                        </IconButton>
                        <div className="relative min-w-[10.5rem] px-1 sm:min-w-[12rem]">
                          <span
                            className="pointer-events-none block truncate py-1 text-center font-mono text-[12px] font-semibold tabular-nums text-ui-navy"
                            aria-hidden
                          >
                            {weekLabel}
                          </span>
                          <input
                            aria-label="Chọn ngày trong tuần"
                            type="date"
                            value={weekStartYmd(weekYmd) ?? weekYmd}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v) setWeekYmd(weekStartYmd(v) ?? v);
                            }}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                        </div>
                        <IconButton
                          label="Tuần sau"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setWeekYmd((w) => shiftStatsPeriodAnchor("week", w, 1))
                          }
                        >
                          ›
                        </IconButton>
                      </div>
                      {!isCurrentWeek ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="px-2.5 text-[11px]"
                          onClick={() => setWeekYmd(today)}
                        >
                          Tuần này
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {mode === "month" ? (
                  <FilterField label="Tháng">
                    <input
                      type="month"
                      className={FIELD}
                      value={monthYm}
                      onChange={(e) =>
                        setMonthYm(e.target.value || today.slice(0, 7))
                      }
                    />
                  </FilterField>
                ) : null}
                {mode === "year" ? (
                  <FilterField label="Năm">
                    <input
                      type="number"
                      className={`${FIELD} w-24`}
                      min={2000}
                      max={2100}
                      value={year}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        setYear(Math.min(2100, Math.max(2000, Math.round(n))));
                      }}
                    />
                  </FilterField>
                ) : null}
                {mode === "range" ? (
                  <>
                    <FilterField label="Từ ngày">
                      <input
                        type="date"
                        className={FIELD}
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value || today)}
                      />
                    </FilterField>
                    <FilterField label="Đến ngày">
                      <input
                        type="date"
                        className={FIELD}
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value || today)}
                      />
                    </FilterField>
                  </>
                ) : null}

                <FilterField label="Kho">
                  <select
                    className={FIELD}
                    value={warehouse}
                    onChange={(e) => {
                      setWarehouse(e.target.value as WarehouseLayoutFilter);
                      setDest("ALL");
                      setCustomerKey("ALL");
                      setFlightKey("ALL");
                    }}
                  >
                    <option value="ALL">Tất cả</option>
                    {WAREHOUSE_ORDER.map((w) => (
                      <option key={w} value={w}>
                        {warehouseLabel[w]}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Dest">
                  <select
                    className={`${FIELD} min-w-[7rem]`}
                    value={dest}
                    onChange={(e) =>
                      setDest(e.target.value === "ALL" ? "ALL" : e.target.value)
                    }
                  >
                    <option value="ALL">Tất cả</option>
                    {destOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Khách">
                  <select
                    className={`${FIELD} min-w-[9rem] max-w-[14rem]`}
                    value={customerKey}
                    onChange={(e) =>
                      setCustomerKey(e.target.value === "ALL" ? "ALL" : e.target.value)
                    }
                  >
                    <option value="ALL">Tất cả</option>
                    {customerOptions.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Chuyến">
                  <select
                    className={`${FIELD} min-w-[7rem]`}
                    value={flightKey}
                    onChange={(e) =>
                      setFlightKey(e.target.value === "ALL" ? "ALL" : e.target.value)
                    }
                  >
                    <option value="ALL">Tất cả</option>
                    {flightOptions.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
                    Trạng thái
                  </span>
                  <div
                    aria-label="Lọc trạng thái"
                    className="flex max-w-full flex-wrap gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => setStatuses("ALL")}
                      className={`min-h-8 rounded-lg px-2 text-[11px] font-bold transition ${
                        statuses === "ALL"
                          ? "bg-ui-navy text-white shadow-ui-sm"
                          : "border border-ui-border/80 bg-ui-surface text-ui-text-muted hover:text-ui-text"
                      }`}
                    >
                      Tất cả
                    </button>
                    {STATUS_FILTER_OPTIONS.map((s) => {
                      const active =
                        statuses !== "ALL" && statuses.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleStatus(s)}
                          className={`min-h-8 rounded-lg px-2 text-[11px] font-bold transition ${
                            active
                              ? "bg-teal-700 text-white shadow-ui-sm"
                              : "border border-ui-border/80 bg-ui-surface text-ui-text-muted hover:text-ui-text"
                          }`}
                        >
                          {statusLabel[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="ml-auto pb-1.5 text-[12px] text-ui-text-muted">
                  Kỳ{" "}
                  <span className="font-bold tabular-nums text-ui-navy">{periodLabel}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-semibold text-teal-800">{t.lots} lô</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="tabular-nums">focus {focusYmd}</span>
                </p>
              </div>
            </div>
          </div>
        }
      >
        {!ready ? (
          <p className="text-sm text-ui-text-muted">Đang tải dữ liệu…</p>
        ) : (
          <div className="space-y-3.5 pb-8">
            <StatsKpiStrip
              items={[
                {
                  label: "Lô",
                  value: t.lots,
                  hint: periodLabel,
                  deltaLabel: lotsDelta.deltaLabel,
                  deltaPositive: lotsDelta.deltaPositive,
                },
                {
                  label: "Kiện",
                  value: t.pcs,
                  deltaLabel: pcsDelta.deltaLabel,
                  deltaPositive: pcsDelta.deltaPositive,
                },
                {
                  label: "Kg thực",
                  value: formatKgTotal(t.actualKg),
                  deltaLabel: actualDelta.deltaLabel,
                  deltaPositive: actualDelta.deltaPositive,
                },
                {
                  label: "Chargeable",
                  value: formatKgTotal(t.chargeableKg),
                  deltaLabel: cwDelta.deltaLabel,
                  deltaPositive: cwDelta.deltaPositive,
                },
                {
                  label: "Δ (CW−Kg)",
                  value: `${deltaPositive ? "+" : ""}${formatKgTotal(t.deltaKg)}`,
                  hint: "Chênh lệch dùng ước tính phí kho bãi",
                  accent: deltaPositive,
                },
                {
                  label: "% Volume",
                  value: formatStatsPct(intel.volumeDonePct),
                  hint: statusMixHint || "VOLUME_DONE trở đi / tổng lô kỳ",
                },
              ]}
            />

            <div className="flex flex-wrap items-center gap-2 px-0.5">
              {t.missingDimLots > 0 ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
                  {t.missingDimLots} lô chưa đo DIM
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/80">
                  Đủ DIM
                </span>
              )}
              {intel.statusMix.slice(0, 4).map((m) => (
                <span
                  key={m.status}
                  className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-800 ring-1 ring-slate-200/80"
                >
                  {statusLabel[m.status] ?? m.status} {m.pct}%
                </span>
              ))}
              <span className="text-[11px] text-ui-text-muted">
                Chargeable = max(Kg, DIM). Chưa DIM → CW = Kg, Δ = 0.
              </span>
            </div>

            <OpsStatsActiveFilterBar
              chips={activeFilterChips}
              onClearAll={clearAllFilters}
            />

            <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
              <div className="border-b border-ui-border/70 px-2 pt-1 sm:px-3">
                <SegmentedTabs
                  ariaLabel="Chế độ thống kê"
                  tabs={INTEL_TABS}
                  value={intelTab}
                  onChange={setIntelTab}
                  counts={{
                    alerts: intel.alerts.length,
                    booking: intel.flightDest.filter(
                      (r) => r.lots > 0 || r.signal === "miss"
                    ).length,
                  }}
                />
              </div>
              <div className="p-3 sm:p-3.5">
                {intelTab === "ops" ? (
                  t.lots === 0 ? (
                    <EmptyState
                      {...(mode === "week"
                        ? formatWeekEmptyCopy(weekLabel)
                        : {
                            title: "Không có lô trong kỳ",
                            description:
                              "Đổi kỳ / kho / dest / khách, hoặc nhập liệu trên Ops rồi quay lại.",
                          })}
                      actionLabel="Về Ops"
                      onAction={onNavigateOps}
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="grid min-h-[12rem] place-items-center rounded-2xl border border-ui-border/60 bg-ui-surface-muted/40 text-sm text-ui-text-muted">
                          Đang tải biểu đồ…
                        </div>
                      }
                    >
                      <OpsStatsChartsPanel
                        byDay={stats.byDay}
                        byWarehouse={stats.byWarehouse}
                        byDest={stats.byDest}
                        onSelectDay={(ymd) => {
                          setMode("day");
                          setDayYmd(ymd);
                          setDetailTab("lots");
                          setIntelTab("ops");
                        }}
                        onSelectWarehouse={(wh) => {
                          setWarehouse(wh);
                          setDest("ALL");
                          setDetailTab("lots");
                        }}
                        onSelectDest={(d) => {
                          setDest(d);
                          setDetailTab("lots");
                        }}
                      />
                    </Suspense>
                  )
                ) : null}
                {intelTab === "booking" ? (
                  <OpsStatsBookingPanel
                    focusYmd={focusYmd}
                    todayYmd={today}
                    insights={intel.insights}
                    flightDest={intel.flightDest}
                    missLanes={missLanes}
                    nextWeek={nextWeek}
                    forecast={forecast}
                    onFocusYmdChange={(ymd) => setFocusYmdOverride(ymd)}
                    onSelectFlightDest={(fk, d) => {
                      setFlightKey(fk);
                      setDest(d);
                      setIntelTab("ops");
                      setDetailTab("lots");
                    }}
                  />
                ) : null}
                {intelTab === "market" ? (
                  <OpsStatsMarketPanel
                    customerShare={intel.customerShare}
                    destShare={intel.destShare}
                    airlineShare={intel.airlineShare}
                    customerDestTop={intel.customerDestTop}
                    sparkByCustomerKey={sparkByCustomerKey}
                    sparkByDestKey={sparkByDestKey}
                    onSelectCustomer={(key) => {
                      setCustomerKey(key);
                      setDetailTab("lots");
                    }}
                    onSelectDest={(d) => {
                      setDest(d);
                      setDetailTab("lots");
                    }}
                  />
                ) : null}
                {intelTab === "alerts" ? (
                  <OpsStatsAlertList
                    alerts={intel.alerts}
                    onSelectAwb={(awb) => {
                      setLotSearch(awb);
                      setDetailTab("lots");
                      setIntelTab("ops");
                    }}
                    onOpenOps={(a) =>
                      openLotFromAlert(a.sessionDate, a.awb, a.shipmentId)
                    }
                  />
                ) : null}
              </div>
            </section>

            {t.lots > 0 ? (
              <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b border-ui-border/70 px-3 pt-2 sm:px-4">
                  <SegmentedTabs
                    ariaLabel="Bảng chi tiết"
                    tabs={DETAIL_TABS}
                    value={detailTab}
                    onChange={setDetailTab}
                    counts={{
                      lots: filteredLots.length,
                      day: stats.byDay.length,
                      warehouse: whAggRows.length,
                      dest: stats.byDest.length,
                    }}
                  />
                  {detailTab === "lots" ? (
                    <input
                      type="search"
                      className={`${FIELD} mb-2 w-full max-w-xs`}
                      placeholder="Tìm AWB / dest / khách…"
                      value={lotSearch}
                      onChange={(e) => setLotSearch(e.target.value)}
                    />
                  ) : (
                    <div className="mb-2 hidden sm:block sm:h-9" />
                  )}
                </div>

                {detailTab === "lots" ? (
                  <LotsDetailTable
                    lots={filteredLots}
                    sort={lotSort}
                    onSortChange={(key) =>
                      setLotSort((prev) => toggleLotSort(prev, key))
                    }
                    onOpenLot={
                      onOpenLot
                        ? (lot) => {
                            const awb = (lot.shipment.awb || "").trim();
                            onOpenLot({
                              sessionYmd:
                                (lot.shipment.sessionDate || "").trim() || focusYmd,
                              query:
                                awb && awb !== MISSING_AWB_LABEL ? awb : "",
                              shipmentId: lot.shipment.id,
                            });
                          }
                        : undefined
                    }
                  />
                ) : null}
                {detailTab === "day" ? (
                  <AggTable rows={dayAggRows} keyLabel="Ngày phiên" />
                ) : null}
                {detailTab === "warehouse" ? (
                  <AggTable rows={whAggRows} keyLabel="Kho" />
                ) : null}
                {detailTab === "dest" ? (
                  <AggTable rows={destAggRows} keyLabel="Dest" />
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </AppShell>
    </div>
  );
}
