import { useMemo, useState, type ReactNode } from "react";
import { statusLabel } from "../statusStyles";
import { formatKgTotal } from "../../utils/formatKgTotal";
import type {
  OpsStatsDestRow,
  OpsStatsDayRow,
  OpsStatsLotRow,
  OpsStatsTotals,
  OpsStatsWarehouseRow,
} from "../../utils/opsStatsMetrics";
import {
  sortOpsStatsLots,
  type LotSortKey,
  type LotSortState,
} from "../../utils/opsStatsLotSort";

const LOT_ROW_H = 41;
const LOT_OVERSCAN = 10;
const LOT_VIRTUALIZE_AT = 80;
const LOT_VIEWPORT_H = 28 * 16; // max-h-[28rem]

export function AggTable({
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

function SortHeader({
  label,
  sortKey,
  sort,
  onSortChange,
  align = "left",
  sticky,
}: {
  label: string;
  sortKey: LotSortKey;
  sort: LotSortState;
  onSortChange?: (key: LotSortKey) => void;
  align?: "left" | "right";
  sticky?: boolean;
}) {
  const active = sort?.key === sortKey;
  const arrow = active ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
  const alignCls = align === "right" ? "text-right" : "text-left";
  const stickyCls = sticky
    ? "sticky left-0 z-[1] bg-slate-50/95 backdrop-blur-sm"
    : "";

  if (!onSortChange) {
    return (
      <th
        className={`px-3.5 py-2.5 font-bold ${alignCls} ${stickyCls}`}
      >
        {label}
      </th>
    );
  }

  return (
    <th className={`px-3.5 py-2.5 font-bold ${alignCls} ${stickyCls}`}>
      <button
        type="button"
        className={`inline-flex items-center gap-0.5 font-bold uppercase tracking-wider hover:text-ui-navy ${
          active ? "text-ui-navy" : "text-ui-text-muted"
        } ${align === "right" ? "ml-auto" : ""}`}
        onClick={() => onSortChange(sortKey)}
      >
        {label}
        <span className="tabular-nums" aria-hidden>
          {arrow || "\u00a0"}
        </span>
      </button>
    </th>
  );
}

function LotRow({
  lot,
  onOpenLot,
}: {
  lot: OpsStatsLotRow;
  onOpenLot?: (lot: OpsStatsLotRow) => void;
}) {
  const s = lot.shipment;
  return (
    <tr
      className="border-b border-ui-border/45 transition hover:bg-teal-500/[0.04]"
      style={{ height: LOT_ROW_H }}
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
      {onOpenLot ? (
        <td className="px-3.5 py-2">
          <button
            type="button"
            className="rounded-md border border-ui-border/70 px-1.5 py-0.5 text-[10px] font-bold text-ui-navy hover:bg-slate-50"
            onClick={() => onOpenLot(lot)}
          >
            Ops
          </button>
        </td>
      ) : null}
    </tr>
  );
}

export function LotsDetailTable({
  lots,
  onOpenLot,
  sort,
  onSortChange,
}: {
  lots: readonly OpsStatsLotRow[];
  onOpenLot?: (lot: OpsStatsLotRow) => void;
  sort: LotSortState;
  onSortChange?: (key: LotSortKey) => void;
}) {
  const sorted = useMemo(() => sortOpsStatsLots(lots, sort), [lots, sort]);
  const [scrollTop, setScrollTop] = useState(0);
  const colSpan = onOpenLot ? 13 : 12;
  const virtualize = sorted.length >= LOT_VIRTUALIZE_AT;

  const { startIdx, endIdx, padTop, padBottom } = useMemo(() => {
    if (!virtualize) {
      return {
        startIdx: 0,
        endIdx: sorted.length,
        padTop: 0,
        padBottom: 0,
      };
    }
    const visible = Math.ceil(LOT_VIEWPORT_H / LOT_ROW_H) + LOT_OVERSCAN * 2;
    const start = Math.max(0, Math.floor(scrollTop / LOT_ROW_H) - LOT_OVERSCAN);
    const end = Math.min(sorted.length, start + visible);
    return {
      startIdx: start,
      endIdx: end,
      padTop: start * LOT_ROW_H,
      padBottom: (sorted.length - end) * LOT_ROW_H,
    };
  }, [virtualize, scrollTop, sorted.length]);

  if (sorted.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-ui-text-muted">Không có lô</p>
    );
  }

  const slice = sorted.slice(startIdx, endIdx);

  return (
    <div
      className={
        virtualize
          ? "max-h-[28rem] overflow-auto"
          : "overflow-x-auto"
      }
      onScroll={
        virtualize
          ? (e) => setScrollTop(e.currentTarget.scrollTop)
          : undefined
      }
    >
      <table className="min-w-full border-collapse text-left text-[13px]">
        <thead className={virtualize ? "sticky top-0 z-[2]" : undefined}>
          <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
            <SortHeader
              label="Ngày"
              sortKey="day"
              sort={sort}
              onSortChange={onSortChange}
              sticky
            />
            <th className="px-3.5 py-2.5 font-bold">Kho</th>
            <th className="px-3.5 py-2.5 font-bold">MAWB</th>
            <th className="px-3.5 py-2.5 font-bold">Dest</th>
            <th className="px-3.5 py-2.5 font-bold">Chuyến</th>
            <th className="px-3.5 py-2.5 font-bold">Khách</th>
            <SortHeader
              label="Kiện"
              sortKey="pcs"
              sort={sort}
              onSortChange={onSortChange}
              align="right"
            />
            <SortHeader
              label="Kg"
              sortKey="kg"
              sort={sort}
              onSortChange={onSortChange}
              align="right"
            />
            <SortHeader
              label="DIM"
              sortKey="dim"
              sort={sort}
              onSortChange={onSortChange}
              align="right"
            />
            <SortHeader
              label="CW"
              sortKey="cw"
              sort={sort}
              onSortChange={onSortChange}
              align="right"
            />
            <SortHeader
              label="Δ"
              sortKey="delta"
              sort={sort}
              onSortChange={onSortChange}
              align="right"
            />
            <th className="px-3.5 py-2.5 font-bold">TT</th>
            {onOpenLot ? <th className="px-3.5 py-2.5 font-bold"> </th> : null}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden style={{ height: padTop }}>
              <td colSpan={colSpan} className="p-0 border-0" />
            </tr>
          ) : null}
          {slice.map((lot) => (
            <LotRow key={lot.shipment.id} lot={lot} onOpenLot={onOpenLot} />
          ))}
          {padBottom > 0 ? (
            <tr aria-hidden style={{ height: padBottom }}>
              <td colSpan={colSpan} className="p-0 border-0" />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function mapDayAgg(rows: readonly OpsStatsDayRow[]) {
  return rows.map((r) => ({ ...r, _key: r.sessionDate }));
}

export function mapWhAgg(rows: readonly OpsStatsWarehouseRow[]) {
  return rows.filter((r) => r.lots > 0).map((r) => ({ ...r, _key: r.label }));
}

export function mapDestAgg(rows: readonly OpsStatsDestRow[]) {
  return rows.map((r) => ({ ...r, _key: r.dest }));
}

export function FilterField({
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
