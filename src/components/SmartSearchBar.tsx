import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
import {
  buildShipmentSearchMatches,
  countShipmentsByWarehouse,
  matchKindLabel,
  type ShipmentSearchContext,
  type ShipmentSearchMatch,
} from "../utils/shipmentSearch";

const WAREHOUSE_CHIP_CLASS: Record<Warehouse, string> = {
  "TECS-TCS": "bg-sky-100 text-sky-900 ring-sky-200/80 dark:bg-sky-950/60 dark:text-sky-200 dark:ring-sky-800/60",
  "TECS-SCSC": "bg-violet-100 text-violet-900 ring-violet-200/80 dark:bg-violet-950/60 dark:text-violet-200 dark:ring-violet-800/60",
  "KHO-TCS": "bg-amber-100 text-amber-950 ring-amber-200/80 dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-800/60",
  "KHO-SCSC": "bg-emerald-100 text-emerald-900 ring-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-800/60",
};

interface SmartSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Lô trong ngày (trước lọc kho / sau lọc trạng thái nếu có). */
  searchableRows: readonly Shipment[];
  /** Lô khớp sau khi áp dụng tìm kiếm — dùng hiển thị phân bổ kho. */
  matchedRows: readonly Shipment[];
  searchContext: ShipmentSearchContext;
  inputRef?: RefObject<HTMLInputElement>;
  onSelectMatch?: (match: ShipmentSearchMatch) => void;
}

export function SmartSearchBar({
  value,
  onChange,
  searchableRows,
  matchedRows,
  searchContext,
  inputRef,
  onSelectMatch,
}: SmartSearchBarProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const mergedRef = inputRef ?? localRef;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const trimmed = value.trim();
  const suggestions = useMemo(
    () => buildShipmentSearchMatches(searchableRows, trimmed, searchContext, 8),
    [searchableRows, trimmed, searchContext]
  );

  const warehouseCounts = useMemo(() => countShipmentsByWarehouse(matchedRows), [matchedRows]);

  useEffect(() => {
    setActiveIdx(0);
  }, [trimmed, suggestions.length]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pickMatch = (match: ShipmentSearchMatch) => {
    onChange(match.shipment.awb.trim() || value);
    setOpen(false);
    onSelectMatch?.(match);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = suggestions[activeIdx];
      if (hit) pickMatch(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-2xl flex-1">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-apple-tertiary dark:text-ops-tertiary"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          ref={mergedRef}
          type="search"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="MAWB / HAWB · Số xe · Tên tài xế… (/ hoặc F)"
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-full border border-black/[0.06] bg-white py-2 pl-10 pr-10 text-[13px] font-medium text-dashboard-primary shadow-dashboard-card placeholder:font-normal placeholder:text-dashboard-muted focus:border-apple-blue/40 focus:outline-none focus:ring-2 focus:ring-apple-blue/15 dark:border-white/10 dark:bg-dashboard-surface-dark dark:text-dashboard-primary-dark dark:placeholder:text-dashboard-muted-dark"
          aria-label="Tìm kiếm thông minh MAWB, HAWB, số xe, tài xế"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="smart-search-listbox"
          role="combobox"
        />
        {trimmed && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
              mergedRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-apple-tertiary hover:bg-black/[0.05] hover:text-apple-label dark:hover:bg-white/[0.06] dark:hover:text-ops-label"
            aria-label="Xóa tìm kiếm"
          >
            ×
          </button>
        )}
      </div>

      {trimmed && matchedRows.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          <span className="text-[10px] font-semibold text-apple-secondary dark:text-ops-secondary">
            {matchedRows.length} lô
          </span>
          {WAREHOUSE_ORDER.filter((wh) => warehouseCounts[wh] > 0).map((wh) => (
            <span
              key={wh}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${WAREHOUSE_CHIP_CLASS[wh]}`}
            >
              {warehouseLabel[wh]} · {warehouseCounts[wh]}
            </span>
          ))}
        </div>
      )}

      {open && trimmed && suggestions.length > 0 && (
        <ul
          id="smart-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 overflow-auto rounded-2xl border border-black/[0.06] bg-white py-1 shadow-dashboard-card-hover dark:border-white/10 dark:bg-dashboard-surface-dark"
        >
          {suggestions.map((match, idx) => (
            <li key={match.shipment.id} role="option" aria-selected={idx === activeIdx}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMatch(match)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                  idx === activeIdx
                    ? "bg-apple-blue/10 dark:bg-apple-blue/15"
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${WAREHOUSE_CHIP_CLASS[match.shipment.warehouse]}`}
                >
                  {warehouseLabel[match.shipment.warehouse]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[12px] font-bold text-dashboard-primary dark:text-dashboard-primary-dark">
                      {match.label}
                    </span>
                    <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-apple-secondary dark:bg-white/[0.06] dark:text-ops-secondary">
                      {matchKindLabel(match.kind)}
                    </span>
                  </span>
                  {match.sublabel && (
                    <span className="mt-0.5 block truncate text-[11px] text-apple-secondary dark:text-ops-secondary">
                      {match.sublabel}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {trimmed && suggestions.length === 0 && (
        <p className="mt-1 text-center text-[10px] text-apple-tertiary dark:text-ops-tertiary">
          Không tìm thấy lô khớp MAWB/HAWB, số xe hoặc tài xế.
        </p>
      )}
    </div>
  );
}
