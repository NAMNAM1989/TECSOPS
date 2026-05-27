import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { MobileDimKgModal } from "./MobileDimKgModal";
import { StatusSelect } from "./StatusBadge";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { statusRowAccent, statusRowBg, statusRowSelected, flightNumberAccent } from "./statusStyles";
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
import { buildShipmentCneeDisplayLines } from "../utils/shipmentCneeCopyBlock";
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
import { EcargoRowNotice } from "./EcargoRowNotice";
import { isEcargoJobRunning, isEcargoJobTerminal } from "../types/ecargoJob";
import { MOBILE } from "../styles/mobileOpsStyles";

const SWIPE_THRESHOLD = 48;
const SWIPE_MAX_VERTICAL_DELTA_PX = 35;
const REVEAL_PX = 44;

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
  pinnedOpenWarehouses = [],
  highlightedShipmentId = null,
  onAddBlankRow,
}: MobileShipmentCardsProps) {
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [openEcargoRowId, setOpenEcargoRowId] = useState<string | null>(null);
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
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

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(
    (id: string) => (e: React.TouchEvent) => {
      const x = e.changedTouches[0].clientX;
      const y = e.changedTouches[0].clientY;
      const dx = touchStartX.current - x;
      const dy = Math.abs(touchStartY.current - y);
      if (dy > SWIPE_MAX_VERTICAL_DELTA_PX) return;
      if (dx > SWIPE_THRESHOLD) setSwipeOpenId(id);
      else if (dx < -SWIPE_THRESHOLD) setSwipeOpenId(null);
    },
    []
  );

  const closeEcargoModal = useCallback(() => setOpenEcargoRowId(null), []);

  useEffect(() => {
    if (!openEcargoRowId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEcargoModal();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [closeEcargoModal, openEcargoRowId]);

  return (
    <>
      <Box className="space-y-4 pb-28 md:hidden">
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
                  className={`mb-3 flex items-end justify-between gap-2 rounded-xl px-0.5 py-1 ${
                    isActiveWarehouse ? "ring-2 ring-apple-blue/40 dark:ring-sky-400/35" : ""
                  }`}
                >
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark">
                      {warehouseLabel[wh]}
                    </h2>
                    {isActiveWarehouse ? (
                      <p className="text-[10px] font-medium text-apple-blue dark:text-sky-300">Kho đang chọn</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-apple-secondary dark:bg-white/[0.08] dark:text-slate-300">
                    {group.length} lô
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
                <div className="space-y-2.5">
                  {group.map((row) => {
                    const open = swipeOpenId === row.id;
                    const selected = selectedId === row.id;
                    const rowAccent = statusRowAccent[row.status];
                    const rowSurface = selected ? statusRowSelected : statusRowBg[row.status];
                    const awbTrim = (row.awb ?? "").trim();
                    const hawbTrim = (row.hawb ?? "").trim();
                    const cneePreview = buildShipmentCneeDisplayLines(row, customerDirectory, {
                      sessionYmdFallback: viewSessionYmd,
                    })
                      .join(" · ")
                      .slice(0, 120);
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

                    return (
                      <Box
                        id={`mobile-shipment-${row.id}`}
                        key={row.id}
                        className={`${MOBILE.card} ${rowAccent} ${rowSurface} ${
                          selected
                            ? "ring-2 ring-apple-blue/45 ring-offset-1 ring-offset-dashboard-canvas dark:ring-sky-400/40 dark:ring-offset-dashboard-canvas-dark"
                            : ""
                        } ${highlightedShipmentId === row.id ? "ring-2 ring-amber-400/70 ring-offset-1" : ""}`}
                      >
                        <div className="absolute inset-y-0 right-0 z-0 flex" style={{ width: REVEAL_PX }} aria-hidden>
                          <button
                            type="button"
                            title="Xóa"
                            className="flex w-11 flex-col items-center justify-center gap-0.5 bg-red-500 text-white active:bg-red-600"
                            onClick={() => {
                              setSwipeOpenId(null);
                              if (confirm(`Xóa ${awbTrim || "lô này"}?`)) onDelete(row.id);
                            }}
                          >
                            <TrashIcon />
                            <span className="text-[9px] font-bold leading-none">Xóa</span>
                          </button>
                        </div>

                        <div
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelect(selected ? null : row.id);
                            }
                          }}
                          onTouchStart={onTouchStart}
                          onTouchEnd={onTouchEnd(row.id)}
                          onClick={() => {
                            setSwipeOpenId(null);
                            onSelect(selected ? null : row.id);
                          }}
                          style={{ transform: open ? `translateX(-${REVEAL_PX}px)` : undefined }}
                          className={MOBILE.cardInner}
                        >
                          <Box className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect(selected ? null : row.id);
                                if (!awbTrim && onQuickEdit) onQuickEdit(row);
                              }}
                            >
                              {awbTrim ? (
                                <p className={MOBILE.awb}>
                                  {awbTrim}
                                  {hawbTrim ? (
                                    <span className="ml-1.5 text-[12px] font-semibold text-apple-secondary dark:text-slate-400">
                                      / {hawbTrim}
                                    </span>
                                  ) : null}
                                </p>
                              ) : (
                                <p className={MOBILE.awbEmpty}>+ Nhập AWB · chạm để mở form</p>
                              )}
                              <p className={`mt-1 ${MOBILE.cardMeta}`}>
                                <span className={`font-bold ${flightNumberAccent}`}>{row.flight || "—"}</span>
                                {row.flightDate ? (
                                  <span className="text-apple-tertiary dark:text-slate-500"> · {row.flightDate}</span>
                                ) : null}
                                {row.dest ? (
                                  <>
                                    <span className="text-apple-tertiary dark:text-slate-500"> · </span>
                                    <span className="font-semibold text-dashboard-primary dark:text-slate-200">
                                      {row.dest}
                                    </span>
                                  </>
                                ) : null}
                              </p>
                            </button>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <div className="flex max-w-[9rem] flex-col items-end gap-0.5">
                                {row.note ? (
                                  <span
                                    className="line-clamp-2 max-w-full text-right text-[10px] leading-snug text-apple-secondary dark:text-slate-400"
                                    title={row.note}
                                  >
                                    {row.note}
                                  </span>
                                ) : null}
                                <StatusSelect
                                  value={row.status}
                                  compact
                                  onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
                                />
                              </div>
                            </div>
                          </Box>

                          <Box className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-black/[0.06] pt-2.5 dark:border-white/[0.08]">
                            <span
                              className="max-w-[55%] truncate text-[12px] font-semibold text-apple-label dark:text-slate-200"
                              title={row.customer}
                            >
                              {row.customer || "Chưa chọn khách"}
                            </span>
                          </Box>

                          {cneePreview ? (
                            <p
                              className="mt-1 line-clamp-2 text-[10px] leading-snug text-apple-tertiary dark:text-slate-500"
                              title={cneePreview}
                            >
                              {cneePreview}
                            </p>
                          ) : null}

                          <Box
                            className="mt-2.5 flex flex-wrap items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className={MOBILE.chip}>
                              <span className="text-apple-tertiary dark:text-slate-500">K</span>
                              <InlineNumberEdit
                                compact
                                value={row.pcs}
                                placeholder="—"
                                className="ml-0.5 text-[11px]"
                                onCommit={(v) => onUpdate(row.id, { pcs: v })}
                              />
                            </span>
                            <span className={MOBILE.chip}>
                              <span className="text-apple-tertiary dark:text-slate-500">G</span>
                              <InlineNumberEdit
                                compact
                                value={row.kg}
                                placeholder="—"
                                className="ml-0.5 text-[11px]"
                                onCommit={(v) => onUpdate(row.id, { kg: v })}
                              />
                            </span>
                            {row.dimWeightKg != null ? (
                              <span className={`${MOBILE.chip} font-semibold`}>
                                DIM {formatShipmentDimWeightKg(row.flight, row.dimWeightKg)}
                              </span>
                            ) : null}
                          </Box>

                          <Box
                            className="mt-2.5 flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {showEcargoKhoScsc && onEcargoVehicleChange && onEcargoAutoRegister && getEcargoSaveStatus ? (
                              <EcargoKhoScscTriggerButton
                                rowId={row.id}
                                open={ecargoOpen}
                                hasVehicle={ecargoReady}
                                job={ecargoJob}
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
                                      : undefined
                                }
                              />
                            ) : null}
                            {onQuickEdit ? (
                              <button
                                type="button"
                                onClick={() => onQuickEdit(row)}
                                className="min-h-9 rounded-full border border-black/[0.08] px-3 text-[11px] font-semibold text-apple-label active:bg-black/[0.04] dark:border-white/12 dark:text-slate-200 dark:active:bg-white/[0.06]"
                              >
                                Sửa
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setDimModalRow(row)}
                              className="ml-auto min-h-9 rounded-full bg-apple-blue px-4 text-[12px] font-semibold text-white shadow-sm active:scale-[0.98] dark:bg-sky-500"
                            >
                              DIM
                            </button>
                          </Box>

                          {showEcargoKhoScsc &&
                          ecargoJob &&
                          (isEcargoJobRunning(ecargoJob.status) ||
                            isEcargoJobTerminal(ecargoJob.status)) ? (
                            <EcargoRowNotice
                              job={ecargoJob}
                              awb={row.awb}
                              compact
                              className="mt-1.5"
                            />
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
      {dimModalRow &&
        typeof document !== "undefined" &&
        createPortal(
          <MobileDimKgModal
            key={dimModalRow.id}
            row={dimModalRow}
            onClose={() => setDimModalRow(null)}
            onSave={(payload) => {
              onUpdate(dimModalRow.id, payload);
              setDimModalRow(null);
            }}
          />,
          document.body
        )}
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
  onDim?: () => void;
}

export function StickyMobileActions({
  selected,
  activeWarehouse,
  onDelete,
  onAdd,
  onQuickEdit,
  onDim,
}: StickyMobileActionsProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <Box className="no-print fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <Box className="px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <Box className="rounded-[22px] border border-black/[0.06] bg-white/90 px-3 py-3 shadow-[0_-6px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-ops-surface/95 dark:shadow-[0_-6px_32px_rgba(0,0,0,0.35)]">
          {selected ? (
            <>
              <p className="mb-2 truncate text-center text-[11px] font-medium text-apple-secondary dark:text-slate-400">
                <span className="font-mono text-[14px] font-bold text-apple-label dark:text-slate-100">
                  {(selected.awb ?? "").trim() || "Lô mới"}
                </span>
                {(selected.hawb ?? "").trim() ? (
                  <span className="font-mono font-semibold"> / {(selected.hawb ?? "").trim()}</span>
                ) : null}
                {selected.customer ? (
                  <>
                    <span className="mx-1 text-apple-tertiary">·</span>
                    {selected.customer}
                  </>
                ) : null}
              </p>
              <Box className="flex gap-2">
                <button type="button" onClick={onQuickEdit} className={`min-w-0 flex-[2] ${MOBILE.primaryBtn}`}>
                  Sửa lô
                </button>
                {onDim ? (
                  <button
                    type="button"
                    onClick={onDim}
                    className={`min-w-0 flex-1 ${MOBILE.secondaryBtn}`}
                  >
                    DIM
                  </button>
                ) : null}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    onClick={() => setMoreOpen((v) => !v)}
                    className={`h-full rounded-full border px-3.5 text-lg font-semibold leading-none active:scale-[0.98] ${MOBILE.secondaryBtn}`}
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
            </>
          ) : (
            <button type="button" onClick={onAdd} className={`w-full ${MOBILE.primaryBtn}`}>
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

function TrashIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
