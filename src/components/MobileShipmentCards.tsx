import { useCallback, useRef, useState } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { CutoffCountdown } from "./CutoffCountdown";
import { StatusSelect } from "./StatusBadge";
import { SummaryBar } from "./SummaryBar";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { statusCardBg } from "./statusStyles";

const SWIPE_THRESHOLD = 48;
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
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

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
      if (dy > 35) return;
      if (dx > SWIPE_THRESHOLD) setSwipeOpenId(id);
      else if (dx < -SWIPE_THRESHOLD) setSwipeOpenId(null);
    },
    []
  );

  return (
    <div className="space-y-5 pb-28 md:hidden">
      {WAREHOUSES.map((wh) => {
        const group = rows.filter((r) => r.warehouse === wh);
        if (group.length === 0) return null;
        return (
          <section key={wh}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight text-apple-label">{wh}</h2>
              <span className="rounded-full bg-apple-label px-2 py-0.5 text-[10px] font-semibold text-white">
                {group.length}
              </span>
            </div>
            <div className="mb-2">
              <SummaryBar rows={rows} warehouse={wh} />
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
                    <div className="absolute inset-y-0 right-0 z-0 flex w-[132px]" aria-hidden>
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
                      className="relative z-10 cursor-pointer bg-white/90 px-2 py-1.5 backdrop-blur-sm transition-transform duration-200 ease-out"
                    >
                      {/* Một dòng ngang — vuốt ngang nếu nội dung dài */}
                      <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-1 overflow-x-auto overscroll-x-contain text-left [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        <span className="shrink-0 font-mono text-[12px] font-semibold tracking-tight text-apple-label">
                          {row.awb}
                        </span>
                        <span className="shrink-0 text-apple-tertiary">·</span>
                        <span className="shrink-0 whitespace-nowrap text-[10px] font-medium text-apple-secondary">
                          {row.flight}/{row.flightDate}
                        </span>
                        <span className="shrink-0 text-apple-tertiary">·</span>
                        <span className="shrink-0 text-[11px] font-semibold text-apple-label">{row.dest}</span>
                        <span className="shrink-0 px-0.5 text-apple-tertiary">|</span>
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <StatusSelect
                            value={row.status}
                            compact
                            onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
                          />
                        </div>
                        <span className="shrink-0 px-0.5 text-apple-tertiary">|</span>
                        <span
                          className="shrink-0 max-w-[6rem] truncate text-[11px] font-semibold text-apple-label"
                          title={row.customer}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.customer}
                        </span>
                        {row.note ? (
                          <>
                            <span className="shrink-0 text-apple-tertiary">·</span>
                            <span
                              className="shrink-0 max-w-[5rem] truncate text-[10px] text-apple-secondary"
                              title={row.note}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.note}
                            </span>
                          </>
                        ) : null}
                        <span
                          className="inline-flex shrink-0 items-center gap-x-1 whitespace-nowrap text-[10px] text-apple-secondary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-apple-tertiary">|</span>
                          {row.cutoffNote ? (
                            <span className="rounded-full bg-red-500 px-1 py-px text-[9px] font-semibold text-white">
                              {row.cutoffNote}
                            </span>
                          ) : null}
                          <span className="font-medium text-apple-tertiary">CO</span>
                          {row.cutoff ? (
                            <CutoffCountdown iso={row.cutoff} className="text-[10px]" />
                          ) : (
                            <span className="italic text-apple-tertiary">—</span>
                          )}
                          <span className="text-apple-tertiary">|</span>
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
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface StickyMobileActionsProps {
  selected: Shipment | null;
  onDelete: () => void;
  onPrint: () => void;
  onAdd: () => void;
  onEdit: () => void;
}

export function StickyMobileActions({
  selected,
  onDelete,
  onPrint,
  onAdd,
  onEdit,
}: StickyMobileActionsProps) {
  return (
    <div className="no-print fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div className="border-t border-black/[0.08] bg-white/80 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl backdrop-saturate-150">
        {selected ? (
          <>
            <p className="mb-2 truncate text-center text-[11px] font-medium text-apple-secondary">
              <span className="font-mono font-semibold text-apple-label">{selected.awb}</span>
              <span className="mx-1 text-apple-tertiary">·</span>
              {selected.customer}
            </p>
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
