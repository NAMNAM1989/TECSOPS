import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { SyncStatus } from "../hooks/useShipmentSync";
import type { Shipment } from "../types/shipment";
import type { WarehouseLayoutFilter } from "../constants/warehouses";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
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
import {
  OpsStatsDayTrendChart,
  OpsStatsDestChart,
  OpsStatsWarehouseChart,
  OpsStatsWarehouseKgChart,
} from "../components/OpsStatsCharts";
import { formatKgTotal } from "../utils/formatKgTotal";
import {
  computeOpsStats,
  listDestOptionsInRange,
  type OpsStatsDayRow,
  type OpsStatsDestRow,
  type OpsStatsLotRow,
  type OpsStatsTotals,
  type OpsStatsWarehouseRow,
} from "../utils/opsStatsMetrics";
import { downloadOpsStatsExcel } from "../utils/exportOpsStatsExcel";
import {
  currentMonthYm,
  formatStatsPeriodLabel,
  formatWeekEmptyCopy,
  formatWeekRangeLabel,
  resolveStatsPeriodRange,
  shiftStatsPeriodAnchor,
  todaySessionYmd,
  todayYmdAsiaSaigon,
  weekStartYmd,
  type StatsPeriodMode,
} from "../utils/opsStatsPeriod";

type Props = {
  rows: readonly Shipment[];
  ready: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  onNavigateOps: () => void;
  onNavigateCustomers: () => void;
};

type DetailTab = "lots" | "day" | "warehouse" | "dest";

const PERIOD_MODES: { id: StatsPeriodMode; label: string }[] = [
  { id: "today", label: "Hôm nay" },
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
  { id: "year", label: "Năm" },
  { id: "range", label: "Khoảng" },
];

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "lots", label: "Chi tiết lô" },
  { id: "day", label: "Theo ngày" },
  { id: "warehouse", label: "Theo kho" },
  { id: "dest", label: "Theo dest" },
];

const FIELD =
  "min-h-9 rounded-lg border border-ui-border/80 bg-ui-surface px-2.5 py-1.5 text-sm text-ui-text outline-none transition focus:border-ui-primary/45 focus:ring-2 focus:ring-ui-focus/80";

function warehouseFilterLabel(w: WarehouseLayoutFilter): string {
  return w === "ALL" ? "Tất cả kho" : warehouseLabel[w];
}

function KpiStrip({
  items,
}: {
  items: {
    label: string;
    value: string | number;
    hint?: string;
    accent?: boolean;
  }[];
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm"
      data-testid="stats-kpi-strip"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-ui-border/60 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        {items.map((item) => (
          <div key={item.label} title={item.hint} className="px-3.5 py-3.5 sm:px-4">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-ui-text-muted">
              {item.label}
            </p>
            <p
              className={`m-0 mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-[1.35rem] ${
                item.accent ? "text-amber-800" : "text-ui-navy"
              }`}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function AggTable({
  rows,
  keyLabel,
  getKey,
}: {
  rows: readonly (OpsStatsTotals & { _key: string })[];
  keyLabel: string;
  getKey?: (r: OpsStatsTotals & { _key: string }) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-ui-text-muted">Không có dòng</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
            <th className="px-3.5 py-2.5 font-bold">{keyLabel}</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Lô</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Kiện</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Kg thực</th>
            <th className="px-3.5 py-2.5 text-right font-bold">DIM</th>
            <th className="px-3.5 py-2.5 text-right font-bold">CW</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Δ</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Chưa DIM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = getKey ? getKey(r) : r._key;
            return (
              <tr
                key={key}
                className="border-b border-ui-border/50 transition last:border-0 hover:bg-teal-500/[0.04]"
              >
                <td className="px-3.5 py-2 font-medium tabular-nums text-ui-navy">{r._key}</td>
                <td className="px-3.5 py-2 text-right tabular-nums">{r.lots}</td>
                <td className="px-3.5 py-2 text-right tabular-nums">{r.pcs}</td>
                <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(r.actualKg)}
                </td>
                <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(r.dimKg)}
                </td>
                <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(r.chargeableKg)}
                </td>
                <td
                  className={`px-3.5 py-2 text-right font-mono tabular-nums ${
                    r.deltaKg > 0 ? "font-semibold text-amber-800" : ""
                  }`}
                >
                  {r.deltaKg > 0 ? "+" : ""}
                  {formatKgTotal(r.deltaKg)}
                </td>
                <td className="px-3.5 py-2 text-right tabular-nums text-ui-text-muted">
                  {r.missingDimLots > 0 ? r.missingDimLots : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LotsDetailTable({ lots }: { lots: readonly OpsStatsLotRow[] }) {
  if (lots.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-ui-text-muted">Không có lô</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
            <th className="sticky left-0 z-[1] bg-slate-50/95 px-3.5 py-2.5 font-bold backdrop-blur-sm">
              Ngày
            </th>
            <th className="px-3.5 py-2.5 font-bold">Kho</th>
            <th className="px-3.5 py-2.5 font-bold">MAWB</th>
            <th className="px-3.5 py-2.5 font-bold">Dest</th>
            <th className="px-3.5 py-2.5 font-bold">Chuyến</th>
            <th className="px-3.5 py-2.5 font-bold">Khách</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Kiện</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Kg</th>
            <th className="px-3.5 py-2.5 text-right font-bold">DIM</th>
            <th className="px-3.5 py-2.5 text-right font-bold">CW</th>
            <th className="px-3.5 py-2.5 text-right font-bold">Δ</th>
            <th className="px-3.5 py-2.5 font-bold">TT</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const s = lot.shipment;
            return (
              <tr
                key={s.id}
                className="border-b border-ui-border/45 transition hover:bg-teal-500/[0.04]"
              >
                <td className="sticky left-0 z-[1] bg-ui-surface/95 px-3.5 py-2 font-medium tabular-nums backdrop-blur-sm">
                  {(s.sessionDate || "").trim()}
                </td>
                <td className="px-3.5 py-2 text-[12px] text-ui-text-muted">
                  {s.warehouse.replace("TECS-", "")}
                </td>
                <td className="px-3.5 py-2 font-shipment-data text-[12px] font-bold text-ui-awb">
                  {s.awb || "—"}
                </td>
                <td className="px-3.5 py-2 font-semibold text-ui-navy">{s.dest || "—"}</td>
                <td className="px-3.5 py-2 text-ui-text-muted">{s.flight || "—"}</td>
                <td className="max-w-[10rem] truncate px-3.5 py-2" title={s.customer}>
                  {s.customerCode ? (
                    <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-700">
                      {s.customerCode}
                    </span>
                  ) : null}
                  {s.customer || "—"}
                </td>
                <td className="px-3.5 py-2 text-right tabular-nums">{lot.pcs || "—"}</td>
                <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(lot.actualKg)}
                </td>
                <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                  {lot.hasDim ? formatKgTotal(lot.dimKg) : "—"}
                </td>
                <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(lot.chargeableKg)}
                </td>
                <td
                  className={`px-3.5 py-2 text-right font-mono tabular-nums ${
                    lot.deltaKg > 0 ? "font-semibold text-amber-800" : ""
                  }`}
                >
                  {lot.hasDim ? (
                    <>
                      {lot.deltaKg > 0 ? "+" : ""}
                      {formatKgTotal(lot.deltaKg)}
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-500">chưa DIM</span>
                  )}
                </td>
                <td className="px-3.5 py-2 text-[11px] text-ui-text-muted">
                  {statusLabel[s.status] ?? s.status}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OpsStatsPage({
  rows,
  ready,
  syncStatus,
  socketConnected,
  onNavigateOps,
  onNavigateCustomers,
}: Props) {
  const toast = useToast();
  const today = todaySessionYmd();
  const todaySaigon = todayYmdAsiaSaigon();

  const [mode, setMode] = useState<StatsPeriodMode>("today");
  const [dayYmd, setDayYmd] = useState(today);
  const [weekYmd, setWeekYmd] = useState(todaySaigon);
  const [monthYm, setMonthYm] = useState(currentMonthYm());
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);
  const [warehouse, setWarehouse] = useState<WarehouseLayoutFilter>("ALL");
  const [dest, setDest] = useState<string | "ALL">("ALL");
  const [exporting, setExporting] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("lots");
  const [lotSearch, setLotSearch] = useState("");

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
        todayYmd: mode === "week" ? todaySaigon : today,
      }),
    [mode, dayYmd, weekYmd, monthYm, year, rangeFrom, rangeTo, today, todaySaigon],
  );

  const destOptions = useMemo(
    () =>
      listDestOptionsInRange(rows, {
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        warehouse,
      }),
    [rows, range.fromYmd, range.toYmd, warehouse],
  );

  const stats = useMemo(
    () =>
      computeOpsStats(rows, {
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        warehouse,
        dest,
      }),
    [rows, range.fromYmd, range.toYmd, warehouse, dest],
  );

  const periodLabel = formatStatsPeriodLabel(range, mode);
  const weekLabel = formatWeekRangeLabel(range.fromYmd, range.toYmd);
  const isCurrentWeek =
    mode === "week" && weekStartYmd(weekYmd) === weekStartYmd(todaySaigon);

  const filteredLots = useMemo(() => {
    const q = lotSearch.trim().toLowerCase();
    if (!q) return stats.lots;
    return stats.lots.filter((lot) => {
      const s = lot.shipment;
      const hay = [
        s.awb,
        s.dest,
        s.flight,
        s.customer,
        s.customerCode,
        s.sessionDate,
        s.warehouse,
        s.note,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [stats.lots, lotSearch]);

  const dayAggRows = useMemo(
    () => stats.byDay.map((r: OpsStatsDayRow) => ({ ...r, _key: r.sessionDate })),
    [stats.byDay],
  );
  const whAggRows = useMemo(
    () =>
      stats.byWarehouse
        .filter((r) => r.lots > 0)
        .map((r: OpsStatsWarehouseRow) => ({ ...r, _key: r.label })),
    [stats.byWarehouse],
  );
  const destAggRows = useMemo(
    () => stats.byDest.map((r: OpsStatsDestRow) => ({ ...r, _key: r.dest })),
    [stats.byDest],
  );

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
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
      });
      toast.success("Đã xuất Excel thống kê");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất Excel thất bại");
    } finally {
      setExporting(false);
    }
  }, [dest, mode, range, stats, toast, warehouse]);

  const t = stats.totals;
  const deltaPositive = t.deltaKg > 0;

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
                <span className="text-[13px] font-extrabold tracking-tight text-ui-navy">
                  Thống kê
                </span>
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
                          onClick={() => setWeekYmd(todaySaigon)}
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
                      onChange={(e) => setMonthYm(e.target.value || currentMonthYm())}
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
                        if (Number.isFinite(n)) setYear(n);
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

                <p className="ml-auto pb-1.5 text-[12px] text-ui-text-muted">
                  Kỳ{" "}
                  <span className="font-bold tabular-nums text-ui-navy">{periodLabel}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-semibold text-teal-800">{t.lots} lô</span>
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
            <KpiStrip
              items={[
                { label: "Lô", value: t.lots, hint: periodLabel },
                { label: "Kiện", value: t.pcs },
                { label: "Kg thực", value: formatKgTotal(t.actualKg) },
                { label: "DIM", value: formatKgTotal(t.dimKg) },
                { label: "Chargeable", value: formatKgTotal(t.chargeableKg) },
                {
                  label: "Δ (CW−Kg)",
                  value: `${deltaPositive ? "+" : ""}${formatKgTotal(t.deltaKg)}`,
                  hint: "Chênh lệch dùng ước tính phí kho bãi",
                  accent: deltaPositive,
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
              <span className="text-[11px] text-ui-text-muted">
                Chargeable = max(Kg, DIM). Chưa DIM → CW = Kg, Δ = 0.
              </span>
            </div>

            {t.lots === 0 ? (
              <EmptyState
                {...(mode === "week"
                  ? formatWeekEmptyCopy(weekLabel)
                  : {
                      title: "Không có lô trong kỳ",
                      description:
                        "Đổi kỳ / kho / dest, hoặc nhập liệu trên Ops rồi quay lại.",
                    })}
                actionLabel="Về Ops"
                onAction={onNavigateOps}
              />
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-3">
                  <OpsStatsDayTrendChart rows={stats.byDay} />
                  <OpsStatsWarehouseChart
                    rows={stats.byWarehouse}
                    onSelect={(wh) => {
                      setWarehouse(wh as WarehouseLayoutFilter);
                      setDest("ALL");
                      setDetailTab("lots");
                    }}
                  />
                  <OpsStatsDestChart
                    rows={stats.byDest}
                    onSelect={(d) => {
                      setDest(d);
                      setDetailTab("lots");
                    }}
                  />
                  <OpsStatsWarehouseKgChart rows={stats.byWarehouse} />
                </div>

                <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-ui-border/70 px-3 pt-2 sm:px-4">
                    <div
                      className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      role="tablist"
                      aria-label="Bảng chi tiết"
                    >
                      {DETAIL_TABS.map((tab) => {
                        const active = detailTab === tab.id;
                        const count =
                          tab.id === "lots"
                            ? filteredLots.length
                            : tab.id === "day"
                              ? stats.byDay.length
                              : tab.id === "warehouse"
                                ? whAggRows.length
                                : stats.byDest.length;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setDetailTab(tab.id)}
                            className={`relative min-h-10 shrink-0 px-3 text-[12px] font-bold transition ${
                              active
                                ? "text-ui-navy"
                                : "text-ui-text-muted hover:text-ui-text"
                            }`}
                          >
                            {tab.label}
                            <span
                              className={`ml-1.5 tabular-nums ${
                                active ? "text-teal-700" : "text-ui-text-muted/80"
                              }`}
                            >
                              {count}
                            </span>
                            {active ? (
                              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ui-primary" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
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

                  {detailTab === "lots" ? <LotsDetailTable lots={filteredLots} /> : null}
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
              </>
            )}
          </div>
        )}
      </AppShell>
    </div>
  );
}
