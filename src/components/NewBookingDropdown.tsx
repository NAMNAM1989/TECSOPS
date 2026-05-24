import { useEffect, useRef, useState } from "react";
import type { Warehouse } from "../types/shipment";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";

interface Props {
  onPickWarehouse: (warehouse: Warehouse) => void;
  onOpenForm?: () => void;
}

/** Nút booking tập trung — dropdown chọn kho đích. */
export function NewBookingDropdown({ onPickWarehouse, onOpenForm }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-apple-blue px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_4px_14px_rgba(0,113,227,0.35)] transition hover:bg-apple-blue-hover active:scale-[0.98]"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New Booking
        <svg
          className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl border border-black/[0.06] bg-white py-1 shadow-dashboard-card-hover dark:border-white/10 dark:bg-dashboard-surface-dark">
          <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-dashboard-muted dark:text-dashboard-muted-dark">
            Thêm dòng nhanh
          </p>
          {WAREHOUSE_ORDER.map((wh) => (
            <button
              key={wh}
              type="button"
              onClick={() => {
                onPickWarehouse(wh);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-[12px] font-semibold text-dashboard-primary hover:bg-black/[0.04] dark:text-dashboard-primary-dark dark:hover:bg-white/[0.06]"
            >
              {warehouseLabel[wh]}
            </button>
          ))}
          {onOpenForm ? (
            <>
              <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.08]" />
              <button
                type="button"
                onClick={() => {
                  onOpenForm();
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[12px] font-semibold text-apple-blue hover:bg-apple-blue/10"
              >
                Form booking đầy đủ…
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
