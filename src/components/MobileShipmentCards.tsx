import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { MobileDimKgModal } from "./MobileDimKgModal";
import { canPrintDimScscReport, printDimReport } from "../utils/printDimReport";
import {
  canExportTcsDimTemplate,
  downloadTcsAttachedDimsExcel,
  printTcsAttachedDimsList,
} from "../utils/exportTcsAttachedDimsExcel";
import { CutoffCountdown } from "./CutoffCountdown";
import { StatusSelect } from "./StatusBadge";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { statusCardBg } from "./statusStyles";
import { partitionShipmentsByWarehouse } from "../utils/partitionShipmentsByWarehouse";

const SWIPE_THRESHOLD = 48;
/** Vuốt ngang bị bỏ qua nếu lệch dọc lớn hơn (coi như cuộn dọc). */
const SWIPE_MAX_VERTICAL_DELTA_PX = 35;
/** Ba nút: Sửa / In / Xóa */
const REVEAL_PX = 132;
const WAREHOUSES: Warehouse[] = ["TECS-TCS", "TECS-SCSC"];

interface MobileShipmentCardsProps {
  rows: Shipment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
}

export function MobileShipmentCards({
  rows,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onPrint,
  onEdit,
}: MobileShipmentCardsProps) {
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const [mobileExtrasOpenId, setMobileExtrasOpenId] = useState<string | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const rowsByWarehouse = useMemo(() => partitionShipmentsByWarehouse(rows), [rows]);

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

  return (
    <>
    <div className="space-y-5 pb-28 md:hidden">
      {WAREHOUSES.map((wh) => {
        const group = rowsByWarehouse[wh];
        if (group.length === 0) return null;
        return (
          <section key={wh}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight text-apple-label">{wh}</h2>
              <span className="rounded-full bg-apple-label px-2 py-0.5 text-[10px] font-semibold text-white">
                {group.length}
              </span>
            </div>
            <div className="space-y-1">
              {group.map((row) => {
                const open = swipeOpenId === row.id;
                const selected = selectedId === row.id;
                const cardColors = statusCardBg[row.status];

                return (
                  <div
                    id={`mobile-shipment-${row.id}`}
                    key={row.id}
                    className={`relative overflow-hidden rounded-2xl border border-black/[0.08] shadow-apple transition-all ${cardColors} ${
                      selected ? "ring-2 ring-apple-blue/40 ring-offset-2 ring-offset-apple-bg" : ""
                    }`}
                  >
                    {/* Vuốt trái: Sửa / In / Xóa */}
                    <div className="absolute inset-y-0 right-0 z-0 flex" style={{ width: REVEAL_PX }} aria-hidden>
                      <button
                        type="button"
                        title="Sửa"
                        className="flex w-11 flex-col items-center justify-center gap-0.5 bg-apple-blue text-white active:bg-apple-blue-hover"
                        onClick={() => {
                          setSwipeOpenId(null);
                          onEdit(row);
                        }}
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                          />
                        </svg>
                        <span className="text-[9px] font-bold leading-none">Sửa</span>
                      </button>
                      <button
                        type="button"
                        title="In nhãn"
                        className="flex w-11 flex-col items-center justify-center gap-0.5 bg-apple-blue/85 text-white active:bg-apple-blue"
                        onClick={() => {
                          setSwipeOpenId(null);
                          onPrint(row);
                        }}
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                          />
                        </svg>
                        <span className="text-[9px] font-bold leading-none">In</span>
                      </button>
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
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.customer}
                            </span>
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
                            <div className="flex items-center gap-2">
                              {row.dimWeightKg != null ? (
                                <span className="min-w-0 truncate rounded-lg bg-black/[0.05] px-2 py-1 text-[11px] font-semibold tabular-nums text-apple-label">
                                  DIM {row.dimWeightKg} kg
                                  {(row.dimLines?.length ?? 0) > 0 ? (
                                    <span className="font-normal text-apple-secondary">
                                      {" "}
                                      · {row.dimLines!.length} nhóm
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-[11px] text-apple-tertiary">Chưa có DIM</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setDimModalRow(row)}
                                className="ml-auto shrink-0 rounded-full bg-apple-blue px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm active:scale-[0.98]"
                              >
                                Nhập DIM
                              </button>
                            </div>
                            {(canPrintDimScscReport(row) ||
                              (row.warehouse === "TECS-TCS" && canExportTcsDimTemplate(row))) && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMobileExtrasOpenId((id) => (id === row.id ? null : row.id))
                                  }
                                  className="text-[11px] font-semibold text-apple-blue"
                                >
                                  {mobileExtrasOpenId === row.id ? "Ẩn in & xuất ▴" : "In & xuất DIM ▾"}
                                </button>
                                {mobileExtrasOpenId === row.id ? (
                                  <div className="mt-2 flex flex-col gap-2 border-t border-black/[0.06] pt-2">
                                    {canPrintDimScscReport(row) ? (
                                      <button
                                        type="button"
                                        onClick={() => printDimReport(row)}
                                        className="w-full rounded-xl border border-black/[0.1] bg-white py-2.5 text-[13px] font-semibold text-apple-label active:bg-black/[0.02]"
                                      >
                                        In DIM SCSC
                                      </button>
                                    ) : null}
                                    {row.warehouse === "TECS-TCS" && canExportTcsDimTemplate(row) ? (
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => downloadTcsAttachedDimsExcel(row)}
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
    </>
  );
}

interface StickyMobileActionsProps {
  selected: Shipment | null;
  onDelete: () => void;
  onPrint: () => void;
  onAdd: () => void;
  onEdit: () => void;
  onPrintDim?: () => void;
}

export function StickyMobileActions({
  selected,
  onDelete,
  onPrint,
  onAdd,
  onEdit,
  onPrintDim,
}: StickyMobileActionsProps) {
  return (
    <div className="no-print fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div className="border-t border-black/[0.08] bg-white/80 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl backdrop-saturate-150">
        {selected ? (
          <>
            <p className="mb-2 truncate text-center text-[11px] font-medium text-apple-secondary">
              <span className="font-mono text-[15px] font-semibold leading-tight text-apple-label">{selected.awb}</span>
              <span className="mx-1 text-apple-tertiary">·</span>
              {selected.customer}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onPrint}
                  className="min-w-0 flex-1 rounded-full bg-apple-label py-3 text-sm font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
                >
                  In nhãn
                </button>
                <button
                  type="button"
                  onClick={onEdit}
                  className="shrink-0 rounded-full border border-black/[0.1] bg-white px-4 py-3 text-sm font-semibold text-apple-blue active:scale-[0.98]"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Xóa ${selected.awb}?`)) onDelete();
                  }}
                  className="shrink-0 rounded-full border border-red-200/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 active:scale-[0.98]"
                >
                  Xóa
                </button>
              </div>
              {onPrintDim && canPrintDimScscReport(selected) ? (
                <button
                  type="button"
                  onClick={onPrintDim}
                  className="w-full rounded-full border border-black/[0.12] bg-white py-2.5 text-sm font-semibold text-apple-label shadow-sm active:scale-[0.98]"
                >
                  In DIM SCSC (bảng kích thước)
                </button>
              ) : null}
              {selected.warehouse === "TECS-TCS" && canExportTcsDimTemplate(selected) ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadTcsAttachedDimsExcel(selected)}
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
