import { memo, useCallback, useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { StatusSelect } from "./StatusBadge";
import { Button } from "../ui";
import { formatKgTotal } from "../utils/formatKgTotal";
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
import { formatAwb } from "../utils/awbFormat";
import {
  formatShipmentCneeReadonlySummary,
} from "../utils/shipmentCneeCopyBlock";
type MobileFlightMeta = {
  flight: string;
  flightDate: string;
  flightDateUrgent: boolean;
  dest: string;
  dimLabel: string;
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

function buildMobileMetaLine(
  customerLabel: string,
  flightPlain: string,
  row: Shipment,
): string {
  const pcs = row.pcs != null ? `${row.pcs}K` : "";
  const kg = row.kg != null ? `${formatKgTotal(row.kg)}kg` : "";
  const qty = [pcs, kg].filter(Boolean).join("/");
  return [customerLabel, flightPlain, qty].filter(Boolean).join(" · ");
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

    const flightMeta = buildMobileFlightMeta(row, sessionYmd);
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
    const metaLine = buildMobileMetaLine(customerLabel, flightMeta.plain, row);
    const cneeSummary = formatShipmentCneeReadonlySummary(row, customerDirectory);

    return (
      <Box
        id={`mobile-shipment-${row.id}`}
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "0 56px",
        }}
        className={`${MOBILE.card} scroll-mt-2 scroll-mb-[calc(6.5rem+env(safe-area-inset-bottom))] ${rowAccent} ${rowSurface} ${
          selected ? "ring-2 ring-ui-primary/40" : ""
        } ${highlighted ? "ring-2 ring-amber-400/70" : ""} ${
          flightMeta.flightDateUrgent ? "ring-1 ring-red-300/80" : ""
        }`}
      >
        <div className={MOBILE.cardInner}>
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="min-w-0 flex-1 py-0 text-left active:opacity-90"
              onClick={() => onOpenEdit(row)}
              aria-label={awbTrim ? `Sửa lô ${awbTrim}` : "Thêm AWB"}
            >
              {awbTrim ? (
                <span className={`block ${MOBILE.awb} !text-[15px]`} title={awbTrim}>
                  {formatAwb(awbTrim)}
                </span>
              ) : (
                <span className={MOBILE.awbEmpty}>+ AWB</span>
              )}
              {hawbTrim ? (
                <span className="mt-px block truncate font-shipment-data text-[9px] font-bold text-ui-text-muted">
                  HAWB {hawbTrim}
                </span>
              ) : null}
            </button>
            <div
              className="flex shrink-0 items-center gap-1"
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

          <button
            type="button"
            className="mt-px flex min-w-0 w-full items-center gap-1 py-0 text-left active:opacity-90"
            onClick={() => onOpenEdit(row)}
            title={[customerTitle, flightMeta.plain, cneeSummary].filter(Boolean).join(" · ") || undefined}
          >
            <span
              className={`min-w-0 flex-1 truncate ${MOBILE.cardMeta} ${
                flightMeta.flightDateUrgent ? "!text-red-600 !font-extrabold" : ""
              }`}
            >
              {metaLine || "—"}
            </span>
          </button>
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

  const renderCard = (row: Shipment) => (
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
  );

  return (
    <div
      className={`space-y-0.5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] scroll-pb-[calc(6.5rem+env(safe-area-inset-bottom))] ${mobileOnlyVisibility(isMobile)}`}
      data-testid="mobile-shipment-list"
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
                className="space-y-0.5"
              >
                <button
                  type="button"
                  onClick={() => toggle(wh)}
                  className="flex min-h-11 w-full touch-manipulation items-center gap-1.5 px-0.5 py-0.5 text-left"
                >
                  <Chevron collapsed={collapsed} />
                  <span className="text-[11px] font-bold text-dashboard-primary">
                    {warehouseLabel[wh]}
                  </span>
                  <span className="text-[10px] text-dashboard-muted">
                    {group.length}
                  </span>
                </button>
                {!collapsed ? group.map(renderCard) : null}
              </section>
            );
          })
        : (rowsByWarehouse[activeWarehouse] ?? []).map(renderCard)}
    </div>
  );
}

interface OpsMobileBookingFabProps {
  activeWarehouse: Warehouse;
  onAdd: () => void;
  /** Ẩn khi edit sheet / modal mở */
  hidden?: boolean;
}

/**
 * CTA chính mobile — FAB góc phải, trên BottomNav, không thanh full-width.
 * Sửa/xóa lô nằm trên card (tap + overflow), không đấu BottomNav.
 */
export function OpsMobileBookingFab({
  activeWarehouse,
  onAdd,
  hidden = false,
}: OpsMobileBookingFabProps) {
  const isMobile = useIsMobile();

  if (hidden) return null;

  return (
    <div
      className={`no-print fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-3 z-40 [[data-ops-mobile-overlay=sheet]_&]:pointer-events-none [[data-ops-mobile-overlay=sheet]_&]:invisible ${mobileOnlyVisibility(isMobile)}`}
      data-testid="ops-mobile-booking-fab"
    >
      <Button
        variant="primary"
        size="md"
        onClick={onAdd}
        title={`Thêm lô vào ${warehouseLabel[activeWarehouse]} (phím N)`}
        className="min-h-11 px-4 font-bold shadow-ui-md"
      >
        + Booking
      </Button>
    </div>
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
