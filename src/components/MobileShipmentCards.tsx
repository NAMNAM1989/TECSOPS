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
import { formatAwb } from "../utils/awbFormat";
import {
  formatShipmentCneeReadonlySummary,
} from "../utils/shipmentCneeCopyBlock";
import {
  findCustomerEntry,
  resolveSavedConsigneeForBooking,
} from "../utils/customerBookingResolve";
import { formatSavedConsigneeDetailTitle } from "../utils/customerConsigneeShipmentPatch";
import type { EcargoVctResult } from "../utils/ecargoVctResultsStore";

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

/** Badge eCargo từ store hiện có — không invent Đình Chỉ nếu chưa có field. */
function MobileEcargoBadges({
  warehouse,
  ecargoVct,
}: {
  warehouse: Warehouse;
  ecargoVct?: EcargoVctResult | null;
}) {
  if (warehouse !== "SCSC" && warehouse !== "TECS-SCSC") return null;
  if (!ecargoVct) return null;

  if (ecargoVct.status === "done") {
    const code = (ecargoVct.vctCode || "").trim();
    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900">
        <span>Đã Cấp VCT</span>
        {code ? (
          <span className="font-mono normal-case tracking-tight">{code.slice(0, 10)}</span>
        ) : null}
      </span>
    );
  }
  if (ecargoVct.status === "otp") {
    return (
      <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-950">
        Mã xác thực
      </span>
    );
  }
  if (ecargoVct.status === "pending") {
    return (
      <span className="inline-flex rounded-md bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-900">
        eCargo…
      </span>
    );
  }
  if (ecargoVct.status === "error") {
    return (
      <span
        className="inline-flex rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-900"
        title={ecargoVct.error || "eCargo lỗi"}
      >
        eCargo lỗi
      </span>
    );
  }
  return null;
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
      className="inline-flex min-h-11 min-w-[3rem] shrink-0 touch-manipulation items-center gap-0.5 rounded-lg bg-ui-surface-muted px-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
        {label}
      </span>
      <InlineNumberEdit
        value={value}
        compact
        placeholder="—"
        className="min-h-[28px] min-w-[1.5rem] px-0.5 font-shipment-data text-[13px] font-bold tabular-nums text-ui-text"
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
    ecargoVct,
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
    ecargoVct?: EcargoVctResult | null;
    onOpenEdit: (row: Shipment) => void;
    onUpdate: (id: string, patch: Partial<Shipment>) => void;
    onDelete: (id: string) => void;
    onPrint: (s: Shipment) => void;
  }) {
    const [cneeOpen, setCneeOpen] = useState(false);
    const rowAccent = statusRowAccent[row.status];
    const rowSurface = selected ? statusRowSelected : statusRowBg;
    const awbTrim = (row.awb ?? "").trim();
    const hawbTrim = (row.hawb ?? "").trim();
    const noteTrim = (row.note ?? "").trim();

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

    const cneeSummary = formatShipmentCneeReadonlySummary(row, customerDirectory);
    const customer = findCustomerEntry(row, customerDirectory);
    const saved = resolveSavedConsigneeForBooking(row, customer);
    const cneeDetail = saved
      ? formatSavedConsigneeDetailTitle(saved)
      : (row.consigneeNamePrint ?? "").trim() || cneeSummary;
    const cneeAddress = (row.consigneeAddressPrint ?? saved?.consigneeAddress ?? "").trim();
    const hasCnee = Boolean(cneeSummary || cneeDetail || cneeAddress);

    return (
      <Box
        id={`mobile-shipment-${row.id}`}
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: cneeOpen ? "0 140px" : "0 78px",
        }}
        className={`${MOBILE.card} scroll-mt-2 scroll-mb-[calc(10.5rem+env(safe-area-inset-bottom))] ${rowAccent} ${rowSurface} ${
          selected ? "ring-2 ring-ui-primary/40" : ""
        } ${highlighted ? "ring-2 ring-amber-400/70" : ""} ${
          flightMeta.flightDateUrgent ? "ring-1 ring-red-300/80" : ""
        }`}
      >
        <div className={`${MOBILE.cardInner} !py-1.5`}>
          {/* Hàng 1: AWB · status · menu — scannable */}
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              className="min-w-0 flex-1 py-0.5 text-left active:opacity-90"
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
                isMobile
                row={row}
                customerDirectory={customerDirectory}
                onPrint={onPrint}
                onDelete={onDelete}
                onUpdate={onUpdate}
              />
            </div>
          </div>

          {/* Hàng 2: khách · chuyến/DEST · K/Kg */}
          <div className="mt-0.5 flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="min-w-0 flex-1 truncate py-0.5 text-left active:opacity-90"
              onClick={() => onOpenEdit(row)}
              title={
                [customerTitle, flightMeta.plain].filter(Boolean).join(" · ") ||
                undefined
              }
            >
              <span className={`mr-1 ${MOBILE.customerName}`}>{customerLabel}</span>
              {flightMeta.plain ? (
                <span
                  className={`${MOBILE.cardMeta} ${
                    flightMeta.flightDateUrgent ? "!text-red-600 !font-extrabold" : ""
                  }`}
                >
                  · {flightMeta.plain}
                </span>
              ) : null}
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

          {/* Hàng 3: eCargo badges + CNEE expand + note */}
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
            <MobileEcargoBadges warehouse={row.warehouse} ecargoVct={ecargoVct} />
            {hasCnee ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCneeOpen((v) => !v);
                }}
                className="inline-flex min-h-9 touch-manipulation items-center gap-1 rounded-lg px-1.5 text-[10px] font-bold text-ui-primary"
                aria-expanded={cneeOpen}
              >
                CNEE {cneeOpen ? "▴" : "▾"}
                {!cneeOpen && cneeSummary ? (
                  <span className="max-w-[9rem] truncate font-semibold text-ui-text-muted">
                    {cneeSummary}
                  </span>
                ) : null}
              </button>
            ) : null}
            {noteTrim && !cneeOpen ? (
              <span className="truncate text-[10px] text-ui-text-muted" title={noteTrim}>
                · {noteTrim}
              </span>
            ) : null}
          </div>

          {cneeOpen && hasCnee ? (
            <div className="mt-1 rounded-lg bg-ui-surface-muted/80 px-2 py-1.5 text-[11px] leading-snug text-ui-text">
              <p className="font-bold">{cneeDetail || cneeSummary || "—"}</p>
              {cneeAddress ? (
                <p className="mt-0.5 whitespace-pre-wrap text-ui-text-muted">{cneeAddress}</p>
              ) : null}
              {noteTrim ? (
                <p className="mt-1 text-[10px] text-ui-text-muted">Ghi chú: {noteTrim}</p>
              ) : null}
            </div>
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
    prev.sessionYmd === next.sessionYmd &&
    prev.ecargoVct === next.ecargoVct,
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
  ecargoVctById?: Record<string, EcargoVctResult>;
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
  ecargoVctById,
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
      ecargoVct={ecargoVctById?.[row.id]}
      onOpenEdit={handleOpenEdit}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onPrint={onPrint}
    />
  );

  return (
    <div
      className={`space-y-1 pb-[calc(10.5rem+env(safe-area-inset-bottom))] scroll-pb-[calc(10.5rem+env(safe-area-inset-bottom))] ${mobileOnlyVisibility(isMobile)}`}
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
                className="space-y-1"
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

interface StickyMobileActionsProps {
  selected: Shipment | null;
  activeWarehouse: Warehouse;
  onDelete: () => void;
  onAdd: () => void;
  onQuickEdit: () => void;
  /** Ẩn khi edit sheet / modal mở */
  hidden?: boolean;
}

/** FAB booking/sửa — nằm trên BottomNav, không che card cuối. */
export function StickyMobileActions({
  selected,
  activeWarehouse,
  onDelete,
  onAdd,
  onQuickEdit,
  hidden = false,
}: StickyMobileActionsProps) {
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);

  if (hidden) return null;

  return (
    <Box
      className={`no-print fixed bottom-[calc(3.85rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-[440px] -translate-x-1/2 [[data-ops-mobile-overlay=sheet]_&]:pointer-events-none [[data-ops-mobile-overlay=sheet]_&]:invisible ${mobileOnlyVisibility(isMobile)}`}
      data-testid="sticky-mobile-actions"
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
