import { memo, useCallback, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { StatusSelect } from "./StatusBadge";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { statusRowAccent, statusRowBg, statusRowSelected } from "./statusStyles";
import {
  warehouseLabel,
  warehouseSectionsForLayout,
  WAREHOUSE_ORDER,
} from "../constants/warehouses";
import { partitionShipmentsByWarehouse } from "../utils/partitionShipmentsByWarehouse";
import { useWarehouseSectionCollapse } from "../hooks/useWarehouseSectionCollapse";
import type { Warehouse } from "../types/shipment";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import { MOBILE, mobileOnlyVisibility } from "../styles/mobileOpsStyles";
import { useIsMobile } from "../hooks/useIsMobile";
import { ShipmentRowActionsMenu } from "./ShipmentRowActionsMenu";

function formatMobileFlightMeta(row: Shipment): string {
  const parts: string[] = [];
  if ((row.flight ?? "").trim()) parts.push((row.flight ?? "").trim());
  if ((row.dest ?? "").trim()) parts.push((row.dest ?? "").trim());
  if (row.dimWeightKg != null) {
    parts.push(`DIM ${formatShipmentDimWeightKg(row.flight, row.dimWeightKg, row.awb)}`);
  }
  return parts.join(" · ");
}

function MobileQuickNumber({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-black/[0.04] px-1 py-px dark:bg-white/[0.06]"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[8px] font-semibold uppercase tracking-wide text-apple-secondary dark:text-slate-400">
        {label}
      </span>
      <InlineNumberEdit
        value={value}
        compact
        placeholder="—"
        className="min-h-[20px] px-0.5 text-[11px]"
        onCommit={onCommit}
      />
    </span>
  );
}

const MobileShipmentCard = memo(
  function MobileShipmentCard({
    row,
    selected,
    highlighted,
    customerDirectory,
    onOpenEdit,
    onUpdate,
    onDelete,
    onPrint,
  }: {
    row: Shipment;
    selected: boolean;
    highlighted: boolean;
    customerDirectory: readonly CustomerDirectoryEntry[];
    onOpenEdit: (row: Shipment) => void;
    onUpdate: (id: string, patch: Partial<Shipment>) => void;
    onDelete: (id: string) => void;
    onPrint: (s: Shipment) => void;
  }) {
    const rowAccent = statusRowAccent[row.status];
    const rowSurface = selected ? statusRowSelected : statusRowBg[row.status];
    const awbTrim = (row.awb ?? "").trim();
    const hawbTrim = (row.hawb ?? "").trim();

    return (
      <Box
        id={`mobile-shipment-${row.id}`}
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 88px" }}
        className={`${MOBILE.card} ${rowAccent} ${rowSurface} ${
          selected ? "ring-1 ring-apple-blue/50 dark:ring-sky-400/45" : ""
        } ${highlighted ? "ring-2 ring-amber-400/70" : ""}`}
      >
        <div className={MOBILE.cardInner}>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="min-w-0 flex-1 text-left active:opacity-90"
              onClick={() => onOpenEdit(row)}
            >
              {awbTrim ? (
                <p className={`truncate ${MOBILE.awb} text-red-600 dark:text-red-400`}>
                  {awbTrim}
                  {hawbTrim ? (
                    <span className="ml-0.5 text-[10px] font-bold text-red-700/80 dark:text-red-400/75">
                      /{hawbTrim}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className={MOBILE.awbEmpty}>+ Nhập AWB</p>
              )}
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                <span className={`max-w-[38%] truncate ${MOBILE.customerName}`} title={row.customer}>
                  {row.customer?.trim() || "Chưa chọn khách"}
                </span>
                {formatMobileFlightMeta(row) ? (
                  <>
                    <span className="text-[10px] text-apple-tertiary dark:text-slate-500">·</span>
                    <span className={`min-w-0 max-w-[34%] truncate ${MOBILE.cardMeta}`}>
                      {formatMobileFlightMeta(row)}
                    </span>
                  </>
                ) : null}
                <MobileQuickNumber
                  label="Kiện"
                  value={row.pcs}
                  onCommit={(v) => onUpdate(row.id, { pcs: v })}
                />
                <MobileQuickNumber label="Kg" value={row.kg} onCommit={(v) => onUpdate(row.id, { kg: v })} />
              </div>
            </button>
            <div className="shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
              <StatusSelect
                compact
                value={row.status}
                onChange={(s) => onUpdate(row.id, { status: s })}
              />
            </div>
          </div>
          <div className="mt-1.5 flex justify-end" onClick={(e) => e.stopPropagation()}>
            <ShipmentRowActionsMenu
              row={row}
              customerDirectory={customerDirectory}
              onPrint={onPrint}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          </div>
        </div>
      </Box>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.selected === next.selected &&
    prev.highlighted === next.highlighted &&
    prev.customerDirectory === next.customerDirectory
);

interface MobileShipmentCardsProps {
  rows: Shipment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onQuickEdit?: (row: Shipment) => void;
  customerDirectory?: readonly CustomerDirectoryEntry[];
  activeWarehouse?: Warehouse;
  searchActive?: boolean;
  viewSessionYmd?: string;
  pinnedOpenWarehouses?: readonly Warehouse[];
  highlightedShipmentId?: string | null;
  onAddBlankRow?: (warehouse: Warehouse) => void;
}

export function MobileShipmentCards({
  rows,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onPrint,
  onQuickEdit,
  customerDirectory = [],
  activeWarehouse = "TECS-TCS",
  searchActive = false,
  pinnedOpenWarehouses = [],
  highlightedShipmentId = null,
  onAddBlankRow,
}: MobileShipmentCardsProps) {
  const isMobile = useIsMobile();
  const rowsByWarehouse = useMemo(() => partitionShipmentsByWarehouse(rows), [rows]);
  const warehouseSections = useMemo((): Warehouse[] => {
    if (searchActive) return [...warehouseSectionsForLayout("ALL")];
    return [...WAREHOUSE_ORDER];
  }, [searchActive]);
  const warehouseCounts = useMemo(() => {
    const counts = {
      "TECS-TCS": 0,
      "TECS-SCSC": 0,
    } as Record<Warehouse, number>;
    for (const wh of warehouseSections) counts[wh] = rowsByWarehouse[wh].length;
    return counts;
  }, [rowsByWarehouse, warehouseSections]);
  const { isCollapsed, toggle } = useWarehouseSectionCollapse(warehouseCounts, pinnedOpenWarehouses);

  const handleOpenEdit = useCallback(
    (row: Shipment) => {
      onSelect(row.id);
      onQuickEdit?.(row);
    },
    [onSelect, onQuickEdit]
  );

  return (
    <div className={`space-y-3 ${mobileOnlyVisibility(isMobile)}`}>
      {warehouseSections.map((wh) => {
        const group = rowsByWarehouse[wh];
        if (!searchActive && group.length === 0 && wh !== activeWarehouse) return null;
        const collapsed = isCollapsed(wh);
        return (
          <section key={wh} id={`warehouse-section-${wh}`} className="space-y-1.5">
            <button
              type="button"
              onClick={() => toggle(wh)}
              className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left"
            >
              <Chevron collapsed={collapsed} />
              <span className="text-[12px] font-bold text-dashboard-primary dark:text-dashboard-primary-dark">
                {warehouseLabel[wh]}
              </span>
              <span className="text-[10px] text-dashboard-muted dark:text-dashboard-muted-dark">
                {group.length} lô
              </span>
              {onAddBlankRow && wh === activeWarehouse ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddBlankRow(wh);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onAddBlankRow(wh);
                    }
                  }}
                  className="ml-auto rounded-full bg-apple-blue px-2 py-0.5 text-[10px] font-semibold text-white"
                >
                  + Booking
                </span>
              ) : null}
            </button>
            {!collapsed
              ? group.map((row) => (
                  <MobileShipmentCard
                    key={row.id}
                    row={row}
                    selected={selectedId === row.id}
                    highlighted={highlightedShipmentId === row.id}
                    customerDirectory={customerDirectory}
                    onOpenEdit={handleOpenEdit}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onPrint={onPrint}
                  />
                ))
              : null}
          </section>
        );
      })}
    </div>
  );
}

interface StickyMobileActionsProps {
  selected: Shipment | null;
  activeWarehouse: Warehouse;
  onDelete: () => void;
  onAdd: () => void;
  onQuickEdit: () => void;
}

export function StickyMobileActions({
  selected,
  activeWarehouse,
  onDelete,
  onAdd,
  onQuickEdit,
}: StickyMobileActionsProps) {
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <Box
      className={`no-print fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-2.5rem)] max-w-[440px] -translate-x-1/2 ${mobileOnlyVisibility(isMobile)}`}
    >
      <Box className="rounded-[28px] border border-black/[0.05] bg-white/85 dark:bg-[#111625]/85 p-2 shadow-apple-md backdrop-blur-xl dark:border-white/[0.06]">
        {selected ? (
          <Box className="flex gap-2">
            <button type="button" onClick={onQuickEdit} className={`min-w-0 flex-1 ${MOBILE.primaryBtn} py-2.5`}>
              Sửa lô
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((v) => !v)}
                className={`min-h-11 min-w-11 rounded-full border px-3 text-lg font-semibold leading-none active:scale-[0.98] ${MOBILE.secondaryBtn}`}
                title="Thêm"
              >
                ⋯
              </button>
              {moreOpen ? (
                <Box className="absolute bottom-full right-0 z-50 mb-2 min-w-[9rem] overflow-hidden rounded-xl border border-black/[0.1] bg-white py-1 shadow-apple-md dark:border-white/12 dark:bg-[#1e293b]">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      if (confirm(`Xóa ${(selected.awb ?? "").trim() || "lô này"}?`)) onDelete();
                    }}
                    className="block w-full px-3 py-2.5 text-left text-sm font-semibold text-red-700 active:bg-red-50 dark:text-red-300 dark:active:bg-red-500/15"
                  >
                    Xóa lô
                  </button>
                </Box>
              ) : null}
            </div>
          </Box>
        ) : (
          <button type="button" onClick={onAdd} className={`w-full ${MOBILE.primaryBtn} py-2.5`}>
            + Booking · {warehouseLabel[activeWarehouse]}
          </button>
        )}
      </Box>
    </Box>
  );
}

function Box({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={className}>
      {children}
    </div>
  );
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-dashboard-muted transition-transform duration-200 ease-out dark:text-dashboard-muted-dark ${
        collapsed ? "" : "rotate-90"
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
