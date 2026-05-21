import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { MobileDimKgModal } from "./MobileDimKgModal";
import { CustomerShipmentDetailModal } from "./CustomerShipmentDetailModal";
import { canPrintDimScscReport, printDimReport } from "../utils/printDimReport";
import {
  canExportTcsDimTemplate,
  downloadTcsAttachedDimsExcel,
  printTcsAttachedDimsList,
} from "../utils/exportTcsAttachedDimsExcel";
import { downloadScscDimListExcel } from "../utils/exportScscDimListExcel";
import { CutoffCountdown } from "./CutoffCountdown";
import { StatusSelect } from "./StatusBadge";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { statusCardBg } from "./statusStyles";
import {
  warehouseLabel,
  warehouseSectionsForLayout,
  isScscWarehouse,
  isTcsWarehouse,
  type WarehouseLayoutFilter,
} from "../constants/warehouses";
import { partitionShipmentsByWarehouse } from "../utils/partitionShipmentsByWarehouse";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import { buildShipmentCneeDisplayLines } from "../utils/shipmentCneeCopyBlock";
import { SelectableTextWithCopyPopover } from "./SelectableTextWithCopyPopover";
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
import { ecargoKhoScscLineStatusLabel } from "../utils/ecargoUiLabels";

const SWIPE_THRESHOLD = 48;
/** Vuốt ngang bị bỏ qua nếu lệch dọc lớn hơn (coi như cuộn dọc). */
const SWIPE_MAX_VERTICAL_DELTA_PX = 35;
/** Một nút: Xóa */
const REVEAL_PX = 44;

interface MobileShipmentCardsProps {
  rows: Shipment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  /** Danh bạ — dùng để hiển thị mã/tên chuẩn trong popup khách. */
  customerDirectory?: readonly CustomerDirectoryEntry[];
  /** Chỉ hiển thị section kho đã chọn trên bộ lọc (mobile). */
  warehouseLayoutFilter?: WarehouseLayoutFilter;
  /** Ngày phiên OPS (YYYY-MM-DD) — dự phòng khi `sessionDate` trên lô trống. */
  viewSessionYmd?: string;
  ecargoMap?: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange?: (id: string, raw: string) => void;
  getEcargoSaveStatus?: (id: string) => EcargoSaveStatus;
  getEcargoJob?: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob?: (id: string) => void | Promise<void>;
  onEcargoAutoRegister?: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering?: (id: string) => boolean;
}

export function MobileShipmentCards({
  rows,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  customerDirectory = [],
  warehouseLayoutFilter = "ALL",
  viewSessionYmd = "",
  ecargoMap = {},
  onEcargoVehicleChange,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
}: MobileShipmentCardsProps) {
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [openEcargoRowId, setOpenEcargoRowId] = useState<string | null>(null);
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const [customerDetailRow, setCustomerDetailRow] = useState<Shipment | null>(null);
  const [mobileExtrasOpenId, setMobileExtrasOpenId] = useState<string | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const rowsByWarehouse = useMemo(() => partitionShipmentsByWarehouse(rows), [rows]);
  const warehouseSections = useMemo(
    () => warehouseSectionsForLayout(warehouseLayoutFilter),
    [warehouseLayoutFilter]
  );
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
    <div className="space-y-5 pb-28 md:hidden">
      {warehouseSections.map((wh) => {
        const group = rowsByWarehouse[wh];
        return (
          <section key={wh}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight text-apple-label">{warehouseLabel[wh]}</h2>
              <span className="rounded-full bg-apple-label px-2 py-0.5 text-[10px] font-semibold text-white">
                {group.length}
              </span>
            </div>
            {group.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-black/[0.1] bg-white/80 px-4 py-6 text-center text-[13px] text-apple-secondary">
                Chưa có lô trong kho này — dùng « Nhập booking mới » bên dưới và chọn đúng kho trong form.
              </p>
            ) : (
            <div className="space-y-1">
              {group.map((row) => {
                const open = swipeOpenId === row.id;
                const selected = selectedId === row.id;
                const cardColors = statusCardBg[row.status];
                const cneeBodyText = buildShipmentCneeDisplayLines(row, customerDirectory, {
                  sessionYmdFallback: viewSessionYmd,
                }).join("\n");
                const showEcargoKhoScsc = isScscWarehouse(row.warehouse);
                const vehicleForEcargo = ecargoMap[row.id]?.vehicleInput ?? "";
                const ecargoLine = ecargoMap[row.id];
                const ecargoJob = getEcargoJob?.(row.id);
                const ecargoOpen = openEcargoRowId === row.id;

                return (
                  <div
                    id={`mobile-shipment-${row.id}`}
                    key={row.id}
                    className={`relative overflow-hidden rounded-2xl border border-black/[0.08] shadow-apple transition-all ${cardColors} ${
                      selected ? "ring-2 ring-apple-blue/40 ring-offset-2 ring-offset-apple-bg" : ""
                    }`}
                  >
                    {/* Vuốt trái: Xóa */}
                    <div className="absolute inset-y-0 right-0 z-0 flex" style={{ width: REVEAL_PX }} aria-hidden>
                      <button
                        type="button"
                        title="Xóa"
                        className="flex w-11 flex-col items-center justify-center gap-0.5 bg-red-500 text-white active:bg-red-600"
                        onClick={() => {
                          setSwipeOpenId(null);
                          if (confirm(`Xóa ${row.awb}?`)) onDelete(row.id);
                        }}
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
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
                      style={{
                        transform: open ? `translateX(-${REVEAL_PX}px)` : undefined,
                      }}
                      className="relative z-10 cursor-pointer bg-white/90 px-2.5 py-2 backdrop-blur-sm transition-transform duration-200 ease-out"
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-left leading-snug">
                            <span className="font-mono text-[15px] font-semibold leading-tight tracking-tight text-apple-label">
                              {row.awb}
                            </span>
                            {(row.hawb ?? "").trim() ? (
                              <>
                                <span className="text-apple-tertiary"> · </span>
                                <span className="font-mono text-[11px] font-semibold text-apple-secondary">
                                  HAWB {(row.hawb ?? "").trim()}
                                </span>
                              </>
                            ) : null}
                            <span className="text-apple-tertiary"> · </span>
                            <span className="text-[11px] font-medium text-apple-secondary">
                              {row.flight}/{row.flightDate}
                            </span>
                            <span className="text-apple-tertiary"> · </span>
                            <span className="text-[13px] font-semibold text-apple-label">{row.dest}</span>
                          </p>
                          <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                            <StatusSelect
                              value={row.status}
                              compact
                              onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
                            />
                          </div>
                        </div>
                        <div className="border-t border-black/[0.06] pt-1.5 text-left text-[11px] leading-snug">
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span
                              className="min-w-0 max-w-full font-semibold text-apple-label sm:max-w-[70%]"
                              title={row.customer}
                            >
                              {row.customer || "Khách"}
                            </span>
                            <button
                              type="button"
                              title="Thông tin CNEE — sao chép"
                              aria-label="Thông tin CNEE"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomerDetailRow(row);
                              }}
                              className="shrink-0 rounded-md border border-black/[0.1] bg-white/90 p-0.5 text-apple-blue hover:bg-apple-blue/10"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                            {row.note ? (
                              <span
                                className="min-w-0 max-w-full text-apple-secondary sm:max-w-[65%]"
                                title={row.note}
                                onClick={(e) => e.stopPropagation()}
                              >
                                · {row.note}
                              </span>
                            ) : null}
                          </div>
                          {cneeBodyText ? (
                            <SelectableTextWithCopyPopover
                              className="mt-0.5 max-h-24 cursor-text select-text overflow-y-auto whitespace-pre-wrap break-words text-[10px] text-apple-secondary"
                              title="Bôi đen chữ → bấm Sao chép nhanh"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cneeBodyText}
                            </SelectableTextWithCopyPopover>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className="inline-flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-[10px] text-apple-secondary"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.cutoffNote ? (
                                <span className="rounded-full bg-red-500 px-1.5 py-px text-[9px] font-semibold text-white">
                                  {row.cutoffNote}
                                </span>
                              ) : null}
                              <span className="shrink-0 font-medium text-apple-tertiary">CO</span>
                              {row.cutoff ? (
                                <CutoffCountdown iso={row.cutoff} className="text-[10px]" />
                              ) : (
                                <span className="italic text-apple-tertiary">—</span>
                              )}
                              <span className="text-apple-tertiary">·</span>
                              <span className="font-medium text-apple-tertiary">K</span>
                              <InlineNumberEdit
                                compact
                                value={row.pcs}
                                placeholder="—"
                                className="text-[11px]"
                                onCommit={(v) => onUpdate(row.id, { pcs: v })}
                              />
                              <span className="font-medium text-apple-tertiary">G</span>
                              <InlineNumberEdit
                                compact
                                value={row.kg}
                                placeholder="—"
                                className="text-[11px]"
                                onCommit={(v) => onUpdate(row.id, { kg: v })}
                              />
                            </span>
                          </div>
                          <div className="mt-2 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap items-center gap-2">
                              {row.dimWeightKg != null ? (
                                <span className="min-w-0 flex-1 truncate rounded-lg bg-black/[0.05] px-2 py-1 text-[11px] font-semibold tabular-nums text-apple-label">
                                  DIM {formatShipmentDimWeightKg(row.flight, row.dimWeightKg)} kg
                                  {(row.dimLines?.length ?? 0) > 0 ? (
                                    <span className="font-normal text-apple-secondary">
                                      {" "}
                                      · {row.dimLines!.length} nhóm
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="min-w-0 flex-1 text-[11px] text-apple-tertiary">Chưa có DIM</span>
                              )}
                              {showEcargoKhoScsc && onEcargoVehicleChange && onEcargoAutoRegister && getEcargoSaveStatus ? (
                                <EcargoKhoScscTriggerButton
                                  rowId={row.id}
                                  open={ecargoOpen}
                                  hasVehicle={vehicleForEcargo.trim().length >= ECARGO_VEHICLE_MIN}
                                  job={ecargoJob}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenEcargoRowId((id) => (id === row.id ? null : row.id));
                                  }}
                                />
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setDimModalRow(row)}
                                className="ml-auto shrink-0 rounded-full bg-apple-blue px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm active:scale-[0.98]"
                              >
                                Nhập DIM
                              </button>
                            </div>
                            {showEcargoKhoScsc && (ecargoLine || ecargoJob) ? (
                              <p className="text-[10px] font-medium text-sky-800">
                                {ecargoKhoScscLineStatusLabel(ecargoLine, ecargoJob)}
                              </p>
                            ) : null}
                            {(canPrintDimScscReport(row) ||
                              (isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row))) && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMobileExtrasOpenId((id) => (id === row.id ? null : row.id))
                                  }
                                  className="text-[11px] font-semibold text-apple-blue"
                                >
                                  {mobileExtrasOpenId === row.id ? "Ẩn xuất DIM ▴" : "Xuất DIM ▾"}
                                </button>
                                {mobileExtrasOpenId === row.id ? (
                                  <div className="mt-2 flex flex-col gap-2 border-t border-black/[0.06] pt-2">
                                    {canPrintDimScscReport(row) ? (
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => printDimReport(row)}
                                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-black/[0.1] bg-white py-2.5 text-[12px] font-semibold text-apple-label active:bg-black/[0.02]"
                                        >
                                          In DIM SCSC
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadScscDimListExcel(row)}
                                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-emerald-600/35 bg-emerald-50 py-2.5 text-[12px] font-semibold text-emerald-900"
                                        >
                                          LIST SCSC
                                        </button>
                                      </div>
                                    ) : null}
                                    {isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row) ? (
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void downloadTcsAttachedDimsExcel(row)}
                                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-emerald-600/35 bg-emerald-50 py-2.5 text-[12px] font-semibold text-emerald-900"
                                        >
                                          LIST TCS
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => printTcsAttachedDimsList(row)}
                                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-emerald-600/25 bg-white py-2.5 text-[12px] font-semibold text-emerald-800"
                                        >
                                          IN TCS
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </section>
        );
      })}
    </div>
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
    {customerDetailRow &&
      typeof document !== "undefined" &&
      createPortal(
        <CustomerShipmentDetailModal
          open
          shipment={
            customerDetailRow ? rows.find((r) => r.id === customerDetailRow.id) ?? customerDetailRow : null
          }
          directory={customerDirectory}
          viewSessionYmd={viewSessionYmd}
          onClose={() => setCustomerDetailRow(null)}
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
        viewSessionYmd={viewSessionYmd}
        saveStatus={getEcargoSaveStatus(ecargoModalRow.id)}
        job={getEcargoJob?.(ecargoModalRow.id)}
        autoRegistering={isEcargoAutoRegistering?.(ecargoModalRow.id) ?? false}
        onVehicleChange={(raw) => onEcargoVehicleChange(ecargoModalRow.id, raw)}
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
  onDelete: () => void;
  onAdd: () => void;
  onQuickEdit: () => void;
  onPrintDim?: () => void;
  onDownloadScscDimList?: () => void;
}

export function StickyMobileActions({
  selected,
  onDelete,
  onAdd,
  onQuickEdit,
  onPrintDim,
  onDownloadScscDimList,
}: StickyMobileActionsProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="no-print fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div className="border-t border-black/[0.08] bg-white/80 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl backdrop-saturate-150">
        {selected ? (
          <>
            <p className="mb-2 truncate text-center text-[11px] font-medium text-apple-secondary">
              <span className="font-mono text-[15px] font-semibold leading-tight text-apple-label">{selected.awb}</span>
              {(selected.hawb ?? "").trim() ? (
                <>
                  <span className="mx-1 text-apple-tertiary">·</span>
                  <span className="font-mono font-semibold text-apple-secondary">HAWB {(selected.hawb ?? "").trim()}</span>
                </>
              ) : null}
              <span className="mx-1 text-apple-tertiary">·</span>
              {selected.customer}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onQuickEdit}
                  className="min-w-0 flex-1 rounded-full border border-apple-blue/30 bg-apple-blue/10 py-3 text-sm font-semibold text-apple-blue transition-transform active:scale-[0.98]"
                >
                  Sửa nhanh
                </button>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    onClick={() => setMoreOpen((v) => !v)}
                    className="rounded-full border border-black/[0.1] bg-white px-4 py-3 text-sm font-semibold text-apple-secondary active:scale-[0.98]"
                    title="Thêm thao tác"
                  >
                    ⋯
                  </button>
                  {moreOpen ? (
                    <div className="absolute bottom-full right-0 z-50 mb-2 min-w-[9rem] overflow-hidden rounded-xl border border-black/[0.1] bg-white py-1 shadow-apple-md">
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          if (confirm(`Xóa ${selected.awb}?`)) onDelete();
                        }}
                        className="block w-full px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Xóa lô
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              {onPrintDim && onDownloadScscDimList && canPrintDimScscReport(selected) ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onPrintDim}
                    className="min-w-0 flex-1 rounded-full border border-black/[0.12] bg-white py-2.5 text-sm font-semibold text-apple-label shadow-sm active:scale-[0.98]"
                  >
                    In DIM SCSC
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadScscDimList}
                    className="min-w-0 flex-1 rounded-full border border-emerald-600/40 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-900 active:scale-[0.98]"
                  >
                    LIST SCSC
                  </button>
                </div>
              ) : null}
              {isTcsWarehouse(selected.warehouse) && canExportTcsDimTemplate(selected) ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadTcsAttachedDimsExcel(selected)}
                    className="min-w-0 flex-1 rounded-full border border-emerald-600/40 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-900 active:scale-[0.98]"
                  >
                    LIST DIM TCS
                  </button>
                  <button
                    type="button"
                    onClick={() => printTcsAttachedDimsList(selected)}
                    className="min-w-0 flex-1 rounded-full border border-emerald-600/30 bg-white py-2.5 text-sm font-semibold text-emerald-800 active:scale-[0.98]"
                  >
                    IN DIM TCS
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="w-full rounded-full bg-apple-blue py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover active:scale-[0.98]"
          >
            + Nhập booking mới
          </button>
        )}
      </div>
    </div>
  );
}
