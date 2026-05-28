import { useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { StatusReadonly } from "./StatusBadge";
import { statusRowAccent, statusRowBg, statusRowSelected } from "./statusStyles";
import {
  warehouseLabel,
  warehouseSectionsForLayout,
  WAREHOUSE_ORDER,
  isScscWarehouse,
} from "../constants/warehouses";
import { partitionShipmentsByWarehouse } from "../utils/partitionShipmentsByWarehouse";
import { useWarehouseSectionCollapse } from "../hooks/useWarehouseSectionCollapse";
import type { Warehouse } from "../types/shipment";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import type { EcargoKhoScscPersistedMap } from "../utils/ecargoRegisterLocalStorage";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";
import type { EcargoJobRecord } from "../types/ecargoJob";
import {
  ECARGO_VEHICLE_MIN,
  EcargoKhoScscCenterModal,
  EcargoKhoScscTriggerButton,
} from "./EcargoKhoScscModal";
import type { EcargoAutoRegisterOpts } from "./DesktopShipmentTable";
import type { UpsertCustomerVehicleParams } from "../utils/customerVehicleCore";
import { resolveEcargoVehiclePrefill, vehicleDisplayLabel } from "../utils/customerVehicleCore";
import { MOBILE } from "../styles/mobileOpsStyles";

function formatMobileLotMeta(row: Shipment): string {
  const parts: string[] = [];
  if ((row.flight ?? "").trim()) parts.push((row.flight ?? "").trim());
  if ((row.dest ?? "").trim()) parts.push((row.dest ?? "").trim());
  const pcs = row.pcs != null && String(row.pcs).trim() !== "" ? String(row.pcs) : "—";
  const kg = row.kg != null && String(row.kg).trim() !== "" ? String(row.kg) : "—";
  parts.push(`${pcs}K/${kg}G`);
  if (row.dimWeightKg != null) {
    parts.push(`DIM ${formatShipmentDimWeightKg(row.flight, row.dimWeightKg)}`);
  }
  return parts.join(" · ");
}

interface MobileShipmentCardsProps {
  rows: Shipment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onQuickEdit?: (row: Shipment) => void;
  customerDirectory?: readonly CustomerDirectoryEntry[];
  activeWarehouse?: Warehouse;
  searchActive?: boolean;
  viewSessionYmd?: string;
  ecargoMap?: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange?: (id: string, raw: string) => void;
  onEcargoDriverChange?: (id: string, driverName: string, driverId: string) => void;
  onEcargoWarehouseChange?: (id: string, arrivalDate: string, arrivalTimeSlot: string) => void;
  onEcargoVehicleTypeChange?: (id: string, vehicleType: string) => void;
  onApplyEcargoPrefill?: (row: Shipment) => void;
  getEcargoSaveStatus?: (id: string) => EcargoSaveStatus;
  getEcargoJob?: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob?: (id: string) => void | Promise<void>;
  onEcargoAutoRegister?: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering?: (id: string) => boolean;
  openEcargoRequestId?: string | null;
  onEcargoRequestHandled?: () => void;
  pinnedOpenWarehouses?: readonly Warehouse[];
  highlightedShipmentId?: string | null;
  onAddBlankRow?: (warehouse: Warehouse) => void;
}

export function MobileShipmentCards({
  rows,
  selectedId,
  onSelect,
  onQuickEdit,
  customerDirectory = [],
  activeWarehouse = "TECS-TCS",
  searchActive = false,
  viewSessionYmd = "",
  ecargoMap = {},
  onEcargoVehicleChange,
  onEcargoDriverChange,
  onEcargoWarehouseChange,
  onEcargoVehicleTypeChange,
  onApplyEcargoPrefill,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
  openEcargoRequestId = null,
  onEcargoRequestHandled,
  pinnedOpenWarehouses = [],
  highlightedShipmentId = null,
  onAddBlankRow,
}: MobileShipmentCardsProps) {
  const [openEcargoRowId, setOpenEcargoRowId] = useState<string | null>(null);
  const rowsByWarehouse = useMemo(() => partitionShipmentsByWarehouse(rows), [rows]);
  const warehouseSections = useMemo((): Warehouse[] => {
    if (searchActive) return [...warehouseSectionsForLayout("ALL")];
    return [...WAREHOUSE_ORDER];
  }, [searchActive]);
  const warehouseCounts = useMemo(() => {
    const counts = {
      "TECS-TCS": 0,
      "TECS-SCSC": 0,
      "KHO-TCS": 0,
      "KHO-SCSC": 0,
    } as Record<Warehouse, number>;
    for (const wh of warehouseSections) counts[wh] = rowsByWarehouse[wh].length;
    return counts;
  }, [rowsByWarehouse, warehouseSections]);
  const { isCollapsed, toggle } = useWarehouseSectionCollapse(warehouseCounts, pinnedOpenWarehouses);
  const ecargoModalRow =
    openEcargoRowId != null
      ? rows.find((r) => r.id === openEcargoRowId && isScscWarehouse(r.warehouse))
      : undefined;

  const closeEcargoModal = useCallback(() => setOpenEcargoRowId(null), []);

  useEffect(() => {
    if (!openEcargoRowId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEcargoModal();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [closeEcargoModal, openEcargoRowId]);

  useEffect(() => {
    if (!openEcargoRequestId) return;
    const row = rows.find((r) => r.id === openEcargoRequestId && isScscWarehouse(r.warehouse));
    if (!row) {
      onEcargoRequestHandled?.();
      return;
    }
    onApplyEcargoPrefill?.(row);
    setOpenEcargoRowId(openEcargoRequestId);
    onEcargoRequestHandled?.();
  }, [onApplyEcargoPrefill, onEcargoRequestHandled, openEcargoRequestId, rows]);

  return (
    <>
      <Box className="space-y-3 pb-[max(5.5rem,env(safe-area-inset-bottom))] md:hidden">
        {warehouseSections.map((wh) => {
          const group = rowsByWarehouse[wh];
          const collapsed = searchActive
            ? isCollapsed(wh)
            : group.length === 0 && wh !== activeWarehouse;
          const showAccordionHeader = searchActive;
          const isActiveWarehouse = wh === activeWarehouse;
          return (
            <section
              key={wh}
              id={`warehouse-section-${wh}`}
              className={isActiveWarehouse && !searchActive ? "scroll-mt-24" : undefined}
            >
              {showAccordionHeader ? (
                <button
                  type="button"
                  onClick={() => toggle(wh)}
                  aria-expanded={!collapsed}
                  className="mb-2 flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left active:bg-black/[0.03] dark:active:bg-white/[0.06]"
                >
                  <Chevron collapsed={collapsed} />
                  <h2 className="text-[15px] font-semibold tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark">
                    {warehouseLabel[wh]}
                  </h2>
                  <span className="rounded-full bg-dashboard-primary/90 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-600">
                    {group.length}
                  </span>
                </button>
              ) : (
                <Box
                  className={`mb-2 flex items-center justify-between gap-2 px-0.5 py-0.5 ${
                    isActiveWarehouse ? "border-l-2 border-apple-blue pl-2 dark:border-sky-400" : ""
                  }`}
                >
                  <h2 className="text-[14px] font-semibold tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark">
                    {warehouseLabel[wh]}
                  </h2>
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-apple-secondary dark:bg-white/[0.08] dark:text-slate-300">
                    {group.length}
                  </span>
                </Box>
              )}
              {!collapsed && group.length === 0 ? (
                onAddBlankRow ? (
                  <button
                    type="button"
                    onClick={() => onAddBlankRow(wh)}
                    className={`w-full ${MOBILE.sectionEmpty} active:scale-[0.99]`}
                  >
                    <p className="text-[15px] font-semibold text-apple-blue dark:text-sky-300">+ Booking mới</p>
                    <p className="mt-1 text-[12px] text-apple-secondary dark:text-slate-400">
                      {warehouseLabel[wh]} · nhập AWB ngay
                    </p>
                  </button>
                ) : (
                  <p className="rounded-2xl border border-dashed border-black/[0.08] bg-white px-4 py-8 text-center text-[13px] text-dashboard-muted dark:border-white/10 dark:bg-dashboard-surface-dark dark:text-dashboard-muted-dark">
                    Chưa có lô trong kho này.
                  </p>
                )
              ) : null}
              {!collapsed && group.length > 0 ? (
                <div className="space-y-1.5">
                  {group.map((row) => {
                    const selected = selectedId === row.id;
                    const rowAccent = statusRowAccent[row.status];
                    const rowSurface = selected ? statusRowSelected : statusRowBg[row.status];
                    const awbTrim = (row.awb ?? "").trim();
                    const hawbTrim = (row.hawb ?? "").trim();
                    const showEcargoKhoScsc = isScscWarehouse(row.warehouse);
                    const ecargoLine = ecargoMap[row.id];
                    const vehicleForEcargo = ecargoLine?.vehicleInput ?? "";
                    const ecargoPrefill = resolveEcargoVehiclePrefill(row, customerDirectory, vehicleForEcargo, {
                      driverName: ecargoLine?.driverName,
                      driverId: ecargoLine?.driverId,
                    });
                    const effectiveEcargoVehicle = vehicleForEcargo.trim() || ecargoPrefill.vehicleInput;
                    const ecargoReady = effectiveEcargoVehicle.trim().length >= ECARGO_VEHICLE_MIN;
                    const ecargoJob = getEcargoJob?.(row.id);
                    const ecargoOpen = openEcargoRowId === row.id;

                    const openEdit = () => {
                      onSelect(row.id);
                      onQuickEdit?.(row);
                    };

                    return (
                      <Box
                        id={`mobile-shipment-${row.id}`}
                        key={row.id}
                        className={`${MOBILE.card} ${rowAccent} ${rowSurface} ${
                          selected
                            ? "ring-1 ring-apple-blue/50 dark:ring-sky-400/45"
                            : ""
                        } ${highlightedShipmentId === row.id ? "ring-2 ring-amber-400/70" : ""}`}
                      >
                        <div className={`${MOBILE.cardInner} flex items-stretch gap-2`}>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left active:opacity-90"
                            onClick={openEdit}
                          >
                            <div className="flex items-start justify-between gap-2">
                              {awbTrim ? (
                                <p className={`min-w-0 flex-1 ${MOBILE.awb}`}>
                                  {awbTrim}
                                  {hawbTrim ? (
                                    <span className="ml-1 text-[11px] font-semibold text-apple-secondary dark:text-slate-400">
                                      /{hawbTrim}
                                    </span>
                                  ) : null}
                                </p>
                              ) : (
                                <p className={MOBILE.awbEmpty}>+ Nhập AWB</p>
                              )}
                              <StatusReadonly value={row.status} compact />
                            </div>
                            <p className={`mt-0.5 ${MOBILE.customerName}`} title={row.customer}>
                              {row.customer?.trim() || "Chưa chọn khách"}
                            </p>
                            <p className={`mt-0.5 truncate ${MOBILE.cardMeta}`}>{formatMobileLotMeta(row)}</p>
                          </button>
                          {showEcargoKhoScsc && onEcargoVehicleChange && onEcargoAutoRegister && getEcargoSaveStatus ? (
                            <div className="flex shrink-0 flex-col justify-center">
                              <EcargoKhoScscTriggerButton
                                rowId={row.id}
                                open={ecargoOpen}
                                hasVehicle={ecargoReady}
                                job={ecargoJob}
                                variant="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const opening = openEcargoRowId !== row.id;
                                  setOpenEcargoRowId((id) => (id === row.id ? null : row.id));
                                  if (opening) onApplyEcargoPrefill?.(row);
                                }}
                                title={
                                  ecargoReady
                                    ? `eCargo · ${effectiveEcargoVehicle}`
                                    : ecargoPrefill.defaultVehicle
                                      ? `Xe mặc định: ${vehicleDisplayLabel(ecargoPrefill.defaultVehicle)}`
                                      : "eCargo — nhập xe & đăng ký"
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                      </Box>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </Box>
      {ecargoModalRow && onEcargoVehicleChange && onEcargoAutoRegister && getEcargoSaveStatus ? (
        <EcargoKhoScscCenterModal
          key={ecargoModalRow.id}
          rowId={ecargoModalRow.id}
          row={ecargoModalRow}
          customerDirectory={customerDirectory}
          vehicleForEcargo={ecargoMap[ecargoModalRow.id]?.vehicleInput ?? ""}
          driverNameForEcargo={ecargoMap[ecargoModalRow.id]?.driverName ?? ""}
          driverIdForEcargo={ecargoMap[ecargoModalRow.id]?.driverId ?? ""}
          arrivalDateForEcargo={ecargoMap[ecargoModalRow.id]?.arrivalDate ?? ""}
          arrivalTimeSlotForEcargo={ecargoMap[ecargoModalRow.id]?.arrivalTimeSlot ?? ""}
          vehicleTypeForEcargo={ecargoMap[ecargoModalRow.id]?.vehicleType ?? ""}
          viewSessionYmd={viewSessionYmd}
          saveStatus={getEcargoSaveStatus(ecargoModalRow.id)}
          job={getEcargoJob?.(ecargoModalRow.id)}
          autoRegistering={isEcargoAutoRegistering?.(ecargoModalRow.id) ?? false}
          onVehicleChange={(raw) => onEcargoVehicleChange(ecargoModalRow.id, raw)}
          onDriverChange={(name, id) => onEcargoDriverChange?.(ecargoModalRow.id, name, id)}
          onWarehouseArrivalChange={(date, slot) => onEcargoWarehouseChange?.(ecargoModalRow.id, date, slot)}
          onVehicleTypeChange={(type) => onEcargoVehicleTypeChange?.(ecargoModalRow.id, type)}
          onAutoRegister={async (opts) => {
            await onEcargoAutoRegister(ecargoModalRow, opts);
          }}
          onSaveVehicleAsDefault={onSaveCustomerVehicleForEcargo}
          onRefreshJob={() => void refreshEcargoJob?.(ecargoModalRow.id)}
          onClose={closeEcargoModal}
        />
      ) : null}
    </>
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
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <Box className="no-print fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <Box className="px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        <Box className="rounded-[18px] border border-black/[0.06] bg-white/90 px-2.5 py-2 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-ops-surface/95">
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
                  <Box className="absolute bottom-full right-0 z-50 mb-2 min-w-[9rem] overflow-hidden rounded-xl border border-black/[0.1] bg-white py-1 shadow-apple-md dark:border-white/12 dark:bg-ops-elevated">
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
      className={`h-4 w-4 shrink-0 text-dashboard-muted transition-transform dark:text-dashboard-muted-dark ${
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