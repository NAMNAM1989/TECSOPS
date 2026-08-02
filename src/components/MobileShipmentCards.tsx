import { memo, useCallback, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { StatusSelect } from "./StatusBadge";
import { InlineNumberEdit } from "./InlineNumberEdit";
import {
  statusRowAccent,
  statusRowBg,
  statusRowSelected,
} from "./statusStyles";
import {
  emptyWarehouseRecord,
  warehouseLabel,
  warehouseSectionsForLayout,
  WAREHOUSE_ORDER,
} from "../constants/warehouses";
import {
  isCargoReportFlightDateUrgent,
  resolveCargoReportCustomerShortCode,
} from "../utils/cargoDayReport";
import { partitionShipmentsByWarehouse } from "../utils/partitionShipmentsByWarehouse";
import { useWarehouseSectionCollapse } from "../hooks/useWarehouseSectionCollapse";
import type { Warehouse } from "../types/shipment";
import {
  formatShipmentDimWeightDisplay,
  resolveShipmentDimWeightKg,
} from "../utils/volumetricDim";
import { MOBILE, mobileOnlyVisibility } from "../styles/mobileOpsStyles";
import { useIsMobile } from "../hooks/useIsMobile";
import { ShipmentRowActionsMenu } from "./ShipmentRowActionsMenu";

type MobileFlightMeta = {
  flight: string;
  flightDate: string;
  flightDateUrgent: boolean;
  dest: string;
  dimLabel: string;
  /** Chuỗi phẳng cho title / empty check */
  plain: string;
};

function buildMobileFlightMeta(
  row: Shipment,
  sessionYmd: string,
): MobileFlightMeta {
  const flight = (row.flight ?? "").trim();
  const flightDate = (row.flightDate ?? "").trim().toUpperCase();
  const dest = (row.dest ?? "").trim();
  const dimKg = resolveShipmentDimWeightKg(row);
  const dimLabel =
    dimKg != null ? `DIM ${formatShipmentDimWeightDisplay(row)}` : "";
  const flightDateUrgent = isCargoReportFlightDateUrgent(
    flightDate,
    sessionYmd,
  );

  const parts: string[] = [];
  if (flight && flightDate) parts.push(`${flight}/${flightDate}`);
  else if (flight) parts.push(flight);
  else if (flightDate) parts.push(flightDate);
  if (dest) parts.push(dest);
  if (dimLabel) parts.push(dimLabel);

  return {
    flight,
    flightDate,
    flightDateUrgent,
    dest,
    dimLabel,
    plain: parts.join(" · "),
  };
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
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ui-surface-muted px-1.5 py-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
        {label}
      </span>
      <InlineNumberEdit
        value={value}
        compact
        placeholder="—"
        className="min-h-[22px] px-0.5 font-shipment-data text-[12px] font-bold tabular-nums text-ui-text"
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
    sessionYmd,
    onOpenEdit,
    onUpdate,
    onDelete,
    onPrint,
  }: {
    row: Shipment;
    selected: boolean;
    highlighted: boolean;
    customerDirectory: readonly CustomerDirectoryEntry[];
    sessionYmd: string;
    onOpenEdit: (row: Shipment) => void;
    onUpdate: (id: string, patch: Partial<Shipment>) => void;
    onDelete: (id: string) => void;
    onPrint: (s: Shipment) => void;
  }) {
    const rowAccent = statusRowAccent[row.status];
    const rowSurface = selected ? statusRowSelected : statusRowBg;
    const awbTrim = (row.awb ?? "").trim();
    const hawbTrim = (row.hawb ?? "").trim();
    const noteTrim = (row.note ?? "").trim();

    const flightMeta = buildMobileFlightMeta(row, sessionYmd);
    const hasNote = noteTrim.length > 0;
    const shortCode = resolveCargoReportCustomerShortCode(
      row,
      customerDirectory,
    );
    const customerLabel =
      shortCode !== "—"
        ? shortCode
        : row.customer?.trim() || "—";
    const customerTitle = [shortCode !== "—" ? shortCode : "", row.customer?.trim()]
      .filter(Boolean)
      .join(" · ");

    return (
      <Box
        id={`mobile-shipment-${row.id}`}
        style={{
          contentVisibility: "auto",
          containIntrinsicSize:
            flightMeta.plain || hasNote ? "0 64px" : "0 52px",
        }}
        className={`${MOBILE.card} ${rowAccent} ${rowSurface} ${
          selected ? "ring-2 ring-ui-primary/40" : ""
        } ${highlighted ? "ring-2 ring-amber-400/70" : ""} ${
          flightMeta.flightDateUrgent ? "ring-1 ring-red-300/80" : ""
        }`}
      >
        <div className={MOBILE.cardInner}>
          {/* Hàng 1: AWB full width còn lại — không chia chỗ với khách/K/Kg */}
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="min-w-0 flex-1 text-left active:opacity-90"
              onClick={() => onOpenEdit(row)}
              aria-label={awbTrim ? `Sửa lô ${awbTrim}` : "Thêm AWB"}
            >
              {awbTrim ? (
                <span className={`block min-w-0 truncate ${MOBILE.awb}`} title={awbTrim}>
                  {awbTrim}
                  {hawbTrim ? (
                    <span className="ml-0.5 font-shipment-data text-[10px] font-bold text-ui-text-muted">
                      /{hawbTrim}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className={MOBILE.awbEmpty}>+ AWB</span>
              )}
            </button>
            <div
              className="flex shrink-0 items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <StatusSelect
                compact
                warehouse={row.warehouse}
                value={row.status}
                onChange={(s) => onUpdate(row.id, { status: s })}
              />
              <ShipmentRowActionsMenu
                compact
                row={row}
                customerDirectory={customerDirectory}
                onPrint={onPrint}
                onDelete={onDelete}
                onUpdate={onUpdate}
              />
            </div>
          </div>

          {/* Hàng 2: Short Code khách + K/Kg */}
          <div className="mt-0.5 flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="min-w-0 flex-1 text-left active:opacity-90"
              onClick={() => onOpenEdit(row)}
            >
              <span
                className={`block min-w-0 truncate ${MOBILE.customerName}`}
                title={customerTitle || undefined}
              >
                {customerLabel}
              </span>
            </button>
            <div
              className="flex shrink-0 items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <MobileQuickNumber
                label="K"
                value={row.pcs}
                onCommit={(v) => onUpdate(row.id, { pcs: v })}
              />
              <MobileQuickNumber
                label="Kg"
                value={row.kg}
                onCommit={(v) => onUpdate(row.id, { kg: v })}
              />
            </div>
          </div>

          {flightMeta.plain || hasNote ? (
            <button
              type="button"
              className="mt-0.5 block w-full min-w-0 text-left active:opacity-90"
              onClick={() => onOpenEdit(row)}
            >
              <p
                className={`truncate ${MOBILE.cardMeta}`}
                title={
                  hasNote
                    ? noteTrim
                    : flightMeta.flightDateUrgent
                      ? `${flightMeta.plain} · gấp (bay cùng phiên)`
                      : flightMeta.plain
                }
              >
                {flightMeta.flight || flightMeta.flightDate ? (
                  <>
                    {flightMeta.flight ? (
                      <span>{flightMeta.flight}</span>
                    ) : null}
                    {flightMeta.flight && flightMeta.flightDate ? (
                      <span>/</span>
                    ) : null}
                    {flightMeta.flightDate ? (
                      <span
                        className={
                          flightMeta.flightDateUrgent
                            ? "font-extrabold text-red-600"
                            : undefined
                        }
                      >
                        {flightMeta.flightDate}
                      </span>
                    ) : null}
                  </>
                ) : null}
                {flightMeta.dest ? (
                  <>
                    {(flightMeta.flight || flightMeta.flightDate) ? " · " : ""}
                    {flightMeta.dest}
                  </>
                ) : null}
                {flightMeta.dimLabel ? (
                  <>
                    {(flightMeta.flight ||
                      flightMeta.flightDate ||
                      flightMeta.dest)
                      ? " · "
                      : ""}
                    {flightMeta.dimLabel}
                  </>
                ) : null}
                {hasNote ? (
                  <>
                    {flightMeta.plain ? " · " : ""}
                    {noteTrim}
                  </>
                ) : null}
              </p>
            </button>
          ) : null}
        </div>
      </Box>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.selected === next.selected &&
    prev.highlighted === next.highlighted &&
    prev.customerDirectory === next.customerDirectory &&
    prev.sessionYmd === next.sessionYmd,
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
  viewSessionYmd = "",
  pinnedOpenWarehouses = [],
  highlightedShipmentId = null,
  onAddBlankRow: _onAddBlankRow,
}: MobileShipmentCardsProps) {
  const isMobile = useIsMobile();
  const rowsByWarehouse = useMemo(
    () => partitionShipmentsByWarehouse(rows),
    [rows],
  );
  const warehouseSections = useMemo((): Warehouse[] => {
    if (searchActive) return [...warehouseSectionsForLayout("ALL")];
    return [...WAREHOUSE_ORDER];
  }, [searchActive]);
  const warehouseCounts = useMemo(() => {
    const counts = emptyWarehouseRecord(() => 0);
    for (const wh of warehouseSections) counts[wh] = rowsByWarehouse[wh].length;
    return counts;
  }, [rowsByWarehouse, warehouseSections]);
  const { isCollapsed, toggle } = useWarehouseSectionCollapse(
    warehouseCounts,
    pinnedOpenWarehouses,
  );

  const handleOpenEdit = useCallback(
    (row: Shipment) => {
      onSelect(row.id);
      onQuickEdit?.(row);
    },
    [onSelect, onQuickEdit],
  );

  return (
    <div
      className={`space-y-0.5 pb-[calc(4.5rem+env(safe-area-inset-bottom))] ${mobileOnlyVisibility(isMobile)}`}
    >
      {searchActive
        ? warehouseSections.map((wh) => {
            const group = rowsByWarehouse[wh];
            if (group.length === 0) return null;
            const collapsed = isCollapsed(wh);
            return (
              <section
                key={wh}
                id={`warehouse-section-${wh}`}
                className="space-y-1"
              >
                <button
                  type="button"
                  onClick={() => toggle(wh)}
                  className="flex w-full items-center gap-1.5 px-0.5 py-0.5 text-left"
                >
                  <Chevron collapsed={collapsed} />
                  <span className="text-[10px] font-bold text-dashboard-primary">
                    {warehouseLabel[wh]}
                  </span>
                  <span className="text-[9px] text-dashboard-muted">
                    {group.length}
                  </span>
                </button>
                {!collapsed
                  ? group.map((row) => (
                      <MobileShipmentCard
                        key={row.id}
                        row={row}
                        selected={selectedId === row.id}
                        highlighted={highlightedShipmentId === row.id}
                        customerDirectory={customerDirectory}
                        sessionYmd={viewSessionYmd}
                        onOpenEdit={handleOpenEdit}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        onPrint={onPrint}
                      />
                    ))
                  : null}
              </section>
            );
          })
        : (rowsByWarehouse[activeWarehouse] ?? []).map((row) => (
            <MobileShipmentCard
              key={row.id}
              row={row}
              selected={selectedId === row.id}
              highlighted={highlightedShipmentId === row.id}
              customerDirectory={customerDirectory}
              sessionYmd={viewSessionYmd}
              onOpenEdit={handleOpenEdit}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onPrint={onPrint}
            />
          ))}
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
      className={`no-print fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-[440px] -translate-x-1/2 ${mobileOnlyVisibility(isMobile)}`}
    >
      <Box className="rounded-2xl border border-ui-border bg-ui-surface p-1.5 shadow-apple-md">
        {selected ? (
          <Box className="flex gap-1.5">
            <button
              type="button"
              onClick={onQuickEdit}
              className={`min-w-0 flex-1 ${MOBILE.primaryBtn}`}
            >
              Sửa lô
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((v) => !v)}
                className={`min-h-11 min-w-11 ${MOBILE.secondaryBtn} px-0 text-lg font-semibold leading-none`}
                title="Thêm"
              >
                ⋯
              </button>
              {moreOpen ? (
                <Box className="absolute bottom-full right-0 z-50 mb-2 min-w-[9.5rem] overflow-hidden rounded-xl border border-ui-border bg-ui-surface py-1 shadow-apple-md">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      if (
                        confirm(
                          `Xóa ${(selected.awb ?? "").trim() || "lô này"}?`,
                        )
                      )
                        onDelete();
                    }}
                    className="block w-full px-3 py-2.5 text-left text-sm font-semibold text-ui-danger hover:bg-red-50"
                  >
                    Xóa lô
                  </button>
                </Box>
              ) : null}
            </div>
          </Box>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className={`w-full ${MOBILE.primaryBtn}`}
          >
            + Booking · {warehouseLabel[activeWarehouse]}
          </button>
        )}
      </Box>
    </Box>
  );
}

function Box({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={className}>
      {children}
    </div>
  );
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-dashboard-muted transition-transform duration-200 ease-out ${
        collapsed ? "" : "rotate-90"
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 4.5l7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}
