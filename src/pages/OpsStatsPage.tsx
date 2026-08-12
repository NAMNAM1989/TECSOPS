import { useCallback, useMemo, useState } from "react";
import type { SyncStatus } from "../hooks/useShipmentSync";
import type { Shipment } from "../types/shipment";
import type { WarehouseLayoutFilter } from "../constants/warehouses";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
import {
  AppShell,
  Button,
  EmptyState,
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
  resolveStatsPeriodRange,
  todaySessionYmd,
  type StatsPeriodMode,
} from "../utils/opsStatsPeriod";
import { requestAiFeature, trackAiEvent } from "../utils/aiOpsClient";

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
  "min-h-9 rounded-lg border border-ui-border bg-white/90 px-2.5 py-1.5 text-sm text-ui-text outline-none focus:border-ui-primary/50 focus:ring-2 focus:ring-ui-focus";

function warehouseFilterLabel(w: WarehouseLayoutFilter): string {
  return w === "ALL" ? "Tất cả kho" : warehouseLabel[w];
}

function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "amber" | "teal" | "sky";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white"
      : tone === "teal"
        ? "border-teal-200/80 bg-gradient-to-br from-teal-50 to-white"
        : tone === "sky"
          ? "border-sky-200/80 bg-gradient-to-br from-sky-50 to-white"
          : "border-ui-border/80 bg-gradient-to-br from-white to-slate-50";

  return (
    <div
      className={`min-w-[7.5rem] flex-1 rounded-2xl border px-3.5 py-3 shadow-ui-sm ${toneClass}`}
      title={hint}
    >
      <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
        {label}
      </p>
      <p className="m-0 mt-1 font-mono text-xl font-extrabold tabular-nums tracking-tight text-ui-navy sm:text-2xl">
        {value}
      </p>
    </div>
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
    return <p className="px-3 py-6 text-center text-sm text-ui-text-muted">Không có dòng</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ui-border bg-slate-50/90 text-[11px] uppercase tracking-wide text-ui-text-muted">
            <th className="px-3 py-2.5 font-semibold">{keyLabel}</th>
            <th className="px-3 py-2.5 text-right font-semibold">Lô</th>
            <th className="px-3 py-2.5 text-right font-semibold">Kiện</th>
            <th className="px-3 py-2.5 text-right font-semibold">Kg thực</th>
            <th className="px-3 py-2.5 text-right font-semibold">DIM</th>
            <th className="px-3 py-2.5 text-right font-semibold">CW</th>
            <th className="px-3 py-2.5 text-right font-semibold">Δ</th>
            <th className="px-3 py-2.5 text-right font-semibold">Chưa DIM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = getKey ? getKey(r) : r._key;
            return (
              <tr
                key={key}
                className="border-b border-ui-border/70 last:border-0 hover:bg-teal-50/40"
              >
                <td className="px-3 py-2 font-medium tabular-nums">{r._key}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.lots}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.pcs}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(r.actualKg)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(r.dimKg)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatKgTotal(r.chargeableKg)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono tabular-nums ${
                    r.deltaKg > 0 ? "font-semibold text-amber-800" : ""
                  }`}
                >
                  {r.deltaKg > 0 ? "+" : ""}
                  {formatKgTotal(r.deltaKg)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
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
    return <p className="px-3 py-6 text-center text-sm text-ui-text-muted">Không có lô</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-ui-border bg-slate-50/90 text-[10px] uppercase tracking-wide text-ui-text-muted">
            <th className="sticky left-0 z-[1] bg-slate-50 px-3 py-2.5 font-semibold">Ngày</th>
            <th className="px-3 py-2.5 font-semibold">Kho</th>
            <th className="px-3 py-2.5 font-semibold">MAWB</th>
            <th className="px-3 py-2.5 font-semibold">Dest</th>
            <th className="px-3 py-2.5 font-semibold">Chuyến</th>
            <th className="px-3 py-2.5 font-semibold">Khách</th>
            <th className="px-3 py-2.5 text-right font-semibold">Kiện</th>
            <th className="px-3 py-2.5 text-right font-semibold">Kg</th>
            <th className="px-3 py-2.5 text-right font-semibold">DIM</th>
            <th className="px-3 py-2.5 text-right font-semibold">CW</th>
            <th className="px-3 py-2.5 text-right font-semibold">Δ</th>
            <th className="px-3 py-2.5 font-semibold">TT</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const s = lot.shipment;
            return (
              <tr
                key={s.id}
                className="border-b border-ui-border/60 hover:bg-teal-50/35"
              >
                <td className="sticky left-0 z-[1] bg-ui-surface px-3 py-1.5 font-medium tabular-nums">
                  {(s.sessionDate || "").trim()}
                </td>
                <td className="px-3 py-1.5 text-[12px] text-ui-text-muted">
                  {s.warehouse.replace("TECS-", "")}
                </td>
                <td className="px-3 py-1.5 font-mono text-[12px]">{s.awb || "—"}</td>
                <td className="px-3 py-1.5 font-semibold">{s.dest || "—"}</td>
                <td className="px-3 py-1.5 text-ui-text-muted">{s.flight || "—"}</td>
                <td className="max-w-[10rem] truncate px-3 py-1.5" title={s.customer}>
                  {s.customerCode ? (
                    <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-700">
                      {s.customerCode}
                    </span>
                  ) : null}
                  {s.customer || "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{lot.pcs || "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatKgTotal(lot.actualKg)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {lot.hasDim ? formatKgTotal(lot.dimKg) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatKgTotal(lot.chargeableKg)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right font-mono tabular-nums ${
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
                <td className="px-3 py-1.5 text-[11px] text-ui-text-muted">
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

  const [mode, setMode] = useState<StatsPeriodMode>("today");
  const [dayYmd, setDayYmd] = useState(today);
  const [monthYm, setMonthYm] = useState(currentMonthYm());
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);
  const [warehouse, setWarehouse] = useState<WarehouseLayoutFilter>("ALL");
  const [dest, setDest] = useState<string | "ALL">("ALL");
  const [exporting, setExporting] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("lots");
  const [lotSearch, setLotSearch] = useState("");
  const [aiSummary, setAiSummary] = useState<unknown>(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);

  const range = useMemo(
    () =>
      resolveStatsPeriodRange({
        mode,
        dayYmd,
        monthYm,
        year,
        rangeFromYmd: rangeFrom,
        rangeToYmd: rangeTo,
        todayYmd: today,
      }),
    [mode, dayYmd, monthYm, year, rangeFrom, rangeTo, today]
  );

  const destOptions = useMemo(
    () =>
      listDestOptionsInRange(rows, {
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        warehouse,
      }),
    [rows, range.fromYmd, range.toYmd, warehouse]
  );

  const stats = useMemo(
    () =>
      computeOpsStats(rows, {
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        warehouse,
        dest,
      }),
    [rows, range.fromYmd, range.toYmd, warehouse, dest]
  );

  const periodLabel = formatStatsPeriodLabel(range, mode);

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
    [stats.byDay]
  );
  const whAggRows = useMemo(
    () =>
      stats.byWarehouse
        .filter((r) => r.lots > 0)
        .map((r: OpsStatsWarehouseRow) => ({ ...r, _key: r.label })),
    [stats.byWarehouse]
  );
  const destAggRows = useMemo(
    () => stats.byDest.map((r: OpsStatsDestRow) => ({ ...r, _key: r.dest })),
    [stats.byDest]
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

  const onAiEndOfDay = useCallback(async () => {
    const sessionDate = mode === "today" ? today : mode === "day" ? dayYmd : range.toYmd;
    setAiSummarizing(true);
    setAiSummary(null);
    try {
      const response = await requestAiFeature<unknown>("end-of-day-summary", { sessionDate });
      if (!response.ok) throw new Error(response.error || "Không tạo được tóm tắt.");
      setAiSummary(response.result ?? null);
      trackAiEvent("ai_end_day_ui_ok", { sessionDate });
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Không tạo được tóm tắt.",
        "AI cuối ngày",
      );
      trackAiEvent("ai_end_day_ui_fail");
    } finally {
      setAiSummarizing(false);
    }
  }, [dayYmd, mode, range.toYmd, toast, today]);

  const t = stats.totals;
  const deltaPositive = t.deltaKg > 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#f1f5f9_100%)]">
      <AppShell
        chrome={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="m-0 leading-none">
                  <Wordmark size="md" />
                </h1>
                <span className="rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                  Dashboard
                </span>
                <SyncStatusPill status={syncStatus} socketConnected={socketConnected} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="secondary" size="sm" onClick={onNavigateOps}>
                  ← Ops
                </Button>
                <Button variant="ghost" size="sm" onClick={onNavigateCustomers}>
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
                <Button
                  disabled={aiSummarizing || !ready}
                  onClick={() => void onAiEndOfDay()}
                  size="sm"
                  variant="secondary"
                >
                  {aiSummarizing ? "AI đang tóm tắt…" : "AI cuối ngày"}
                </Button>
              </div>
            </div>

            <div
              className="rounded-2xl border border-teal-100/80 bg-white/80 p-3 shadow-ui-sm backdrop-blur-sm"
            >
              <div
                aria-label="Bộ lọc thống kê"
                className="mb-2.5 flex flex-wrap items-center gap-1.5"
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
                      className={`min-h-9 rounded-full px-3.5 text-[12px] font-semibold transition ${
                        active
                          ? "bg-ui-navy text-white shadow-sm"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                {mode === "day" ? (
                  <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">
                    Ngày
                    <input
                      type="date"
                      className={FIELD}
                      value={dayYmd}
                      onChange={(e) => setDayYmd(e.target.value || today)}
                    />
                  </label>
                ) : null}
                {mode === "month" ? (
                  <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">
                    Tháng
                    <input
                      type="month"
                      className={FIELD}
                      value={monthYm}
                      onChange={(e) => setMonthYm(e.target.value || currentMonthYm())}
                    />
                  </label>
                ) : null}
                {mode === "year" ? (
                  <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">
                    Năm
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
                  </label>
                ) : null}
                {mode === "range" ? (
                  <>
                    <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">
                      Từ ngày
                      <input
                        type="date"
                        className={FIELD}
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value || today)}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">
                      Đến ngày
                      <input
                        type="date"
                        className={FIELD}
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value || today)}
                      />
                    </label>
                  </>
                ) : null}

                <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">
                  Kho
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
                </label>

                <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">
                  Dest
                  <select
                    className={`${FIELD} min-w-[7rem]`}
                    value={dest}
                    onChange={(e) => setDest(e.target.value === "ALL" ? "ALL" : e.target.value)}
                  >
                    <option value="ALL">Tất cả</option>
                    {destOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="pb-1.5 text-[12px] text-ui-text-muted">
                  Kỳ{" "}
                  <span className="font-bold text-ui-navy">{periodLabel}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-semibold text-teal-800">{t.lots} lô</span>
                  {" trong bộ lọc"}
                </p>
              </div>
            </div>
          </div>
        }
      >
        {!ready ? (
          <p className="text-sm text-ui-text-muted">Đang tải dữ liệu…</p>
        ) : (
          <div className="space-y-4 pb-8">
            <div className="flex flex-wrap gap-2.5">
              <KpiCard label="Lô" value={t.lots} tone="teal" />
              <KpiCard label="Kiện" value={t.pcs} />
              <KpiCard label="Kg thực" value={formatKgTotal(t.actualKg)} tone="sky" />
              <KpiCard label="DIM" value={formatKgTotal(t.dimKg)} tone="sky" />
              <KpiCard label="Chargeable" value={formatKgTotal(t.chargeableKg)} tone="teal" />
              <KpiCard
                label="Δ (CW−Kg)"
                value={`${deltaPositive ? "+" : ""}${formatKgTotal(t.deltaKg)}`}
                hint="Chênh lệch dùng ước tính phí kho bãi"
                tone="amber"
              />
            </div>

            {aiSummary ? (
              <section
                aria-label="Tóm tắt AI cuối ngày"
                className="rounded-2xl border border-violet-200 bg-violet-50 p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-bold text-violet-950">Tóm tắt AI cuối ngày</h2>
                  <Button onClick={() => setAiSummary(null)} size="sm" variant="ghost">
                    Ẩn
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-violet-950">
                  {JSON.stringify(aiSummary, null, 2)}
                </pre>
              </section>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {t.missingDimLots > 0 ? (
                <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-[11px] font-semibold text-white">
                  {t.missingDimLots} lô chưa đo DIM
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white">
                  Đủ DIM
                </span>
              )}
              <span className="text-[11px] text-ui-text-muted">
                Chargeable = max(Kg, DIM). Chưa DIM → CW = Kg, Δ = 0.
              </span>
            </div>

            {t.lots === 0 ? (
              <EmptyState
                title="Không có lô trong kỳ"
                description="Đổi kỳ / kho / dest, hoặc nhập liệu trên Ops rồi quay lại."
                actionLabel="Về Ops"
                onAction={onNavigateOps}
              />
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
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

                <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-white shadow-ui-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ui-border bg-slate-50/80 px-3 py-2.5">
                    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Bảng chi tiết">
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
                            className={`min-h-9 rounded-full px-3 text-[12px] font-semibold transition ${
                              active
                                ? "bg-ui-primary text-white"
                                : "bg-white text-ui-text ring-1 ring-ui-border hover:bg-slate-100"
                            }`}
                          >
                            {tab.label}
                            <span
                              className={`ml-1.5 tabular-nums ${
                                active ? "text-white/80" : "text-ui-text-muted"
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {detailTab === "lots" ? (
                      <input
                        type="search"
                        className={`${FIELD} w-full max-w-xs`}
                        placeholder="Tìm AWB / dest / khách…"
                        value={lotSearch}
                        onChange={(e) => setLotSearch(e.target.value)}
                      />
                    ) : null}
                  </div>

                  {detailTab === "lots" ? (
                    <LotsDetailTable lots={filteredLots} />
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
              </>
            )}
          </div>
        )}
      </AppShell>
    </div>
  );
}
