import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { Shipment, Warehouse } from "../types/shipment";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
import {
  buildShipmentSearchMatches,
  countShipmentsByWarehouse,
  listFlightDateFacets,
  matchKindLabel,
  normalizeFlightDateToken,
  type ShipmentSearchContext,
  type ShipmentSearchMatch,
} from "../utils/shipmentSearch";

const WAREHOUSE_CHIP_CLASS: Record<Warehouse, string> = {
  "TECS-TCS": "bg-sky-100 text-sky-900 ring-sky-200/80",
  "TECS-SCSC": "bg-violet-100 text-violet-900 ring-violet-200/80",
  TCS: "bg-cyan-100 text-cyan-900 ring-cyan-200/80",
  SCSC: "bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-200/80",
};

interface SmartSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Lọc ngày bay tách khỏi ô gõ — không ghi đè text tìm kiếm. */
  flightDateFilter?: string;
  onFlightDateChange?: (date: string) => void;
  /** Lô trong ngày (sau lọc trạng thái nếu có). */
  searchableRows: readonly Shipment[];
  /** Lô khớp sau tìm kiếm — phân bổ kho. */
  matchedRows: readonly Shipment[];
  searchContext: ShipmentSearchContext;
  inputRef?: RefObject<HTMLInputElement>;
  onSelectMatch?: (match: ShipmentSearchMatch) => void;
  /** Gọn — mobile header */
  compact?: boolean;
  /**
   * desktop: chip ngày bay nằm cạnh ô tìm (1 hàng), không xếp dưới gây khoảng trống.
   * compact/mobile vẫn stack.
   */
  inlineFacets?: boolean;
  /** Chip ngày bay thấp hơn — hàng lọc desktop gọn */
  tightFacets?: boolean;
  /** Trì hoãn onChange (ms) — giảm re-filter khi gõ tìm kiếm */
  debounceMs?: number;
}

function FlightDateChips({
  facets,
  activeDate,
  onPick,
  tight = false,
}: {
  facets: ReturnType<typeof listFlightDateFacets>;
  activeDate: string;
  onPick: (date: string) => void;
  tight?: boolean;
}) {
  if (!facets.length) return null;
  return (
    <div
      className="-mx-0.5 flex min-w-0 items-center gap-1 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Lọc ngày bay"
    >
      {facets.map((f) => {
        const active = activeDate === f.date;
        return (
          <button
            key={f.date}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(active ? "" : f.date)}
            className={`inline-flex shrink-0 items-center justify-center gap-0.5 ring-1 transition active:scale-[0.98] ${
              tight
                ? "h-8 rounded-lg px-2 text-[10px] font-bold tabular-nums"
                : "min-h-11 min-w-11 rounded-md px-1.5 text-[10px] font-bold tabular-nums"
            } ${
              active
                ? "bg-ui-primary text-white ring-ui-primary"
                : "bg-ui-surface text-ui-text ring-ui-border hover:bg-emerald-50 hover:ring-emerald-300/70"
            }`}
            aria-pressed={active}
            title={
              active
                ? `Bỏ lọc ngày bay ${f.date}`
                : `Lọc ${f.count} lô ngày bay ${f.date}`
            }
          >
            <span>{f.date}</span>
            <span
              className={`rounded px-1 py-px text-[9px] font-semibold ${
                active ? "bg-white/20 text-white" : "bg-ui-surface-muted text-ui-text-muted"
              }`}
            >
              {f.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SuggestionList({
  suggestions,
  activeIdx,
  onPick,
  id,
}: {
  suggestions: ShipmentSearchMatch[];
  activeIdx: number;
  onPick: (match: ShipmentSearchMatch) => void;
  id: string;
}) {
  if (!suggestions.length) return null;
  return (
    <ul
      id={id}
      role="listbox"
      className="max-h-[min(50vh,20rem)] overflow-auto rounded-xl border border-ui-border bg-ui-surface py-1 shadow-apple-md"
    >
      {suggestions.map((match, idx) => (
        <li key={match.shipment.id} role="option" aria-selected={idx === activeIdx}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(match)}
            className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
              idx === activeIdx ? "bg-ui-primary/10" : "hover:bg-ui-surface-muted"
            }`}
          >
            <span
              className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${WAREHOUSE_CHIP_CLASS[match.shipment.warehouse]}`}
            >
              {warehouseLabel[match.shipment.warehouse]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-mono text-[12px] font-bold text-ui-text">
                  {match.label}
                </span>
                <span className="rounded bg-ui-surface-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-ui-text-muted">
                  {matchKindLabel(match.kind)}
                </span>
              </span>
              {match.sublabel ? (
                <span className="mt-0.5 block truncate text-[11px] text-ui-text-muted">
                  {match.sublabel}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SmartSearchBar({
  value,
  onChange,
  flightDateFilter = "",
  onFlightDateChange,
  searchableRows,
  matchedRows,
  searchContext,
  inputRef,
  onSelectMatch,
  compact = false,
  inlineFacets = false,
  tightFacets = false,
  debounceMs = 0,
}: SmartSearchBarProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const mergedRef = inputRef ?? localRef;
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [draftValue, setDraftValue] = useState(value);
  const [matchQuery, setMatchQuery] = useState(value.trim());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftValue(value);
    setMatchQuery(value.trim());
  }, [value]);

  const emitChange = (next: string) => {
    onChange(next);
    setMatchQuery(next.trim());
  };

  const queueFilterChange = (next: string) => {
    setDraftValue(next);
    if (debounceMs <= 0) {
      emitChange(next);
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      emitChange(next);
    }, debounceMs);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const trimmed = draftValue.trim();
  const activeFlightDate =
    flightDateFilter || normalizeFlightDateToken(trimmed);
  const flightFacets = useMemo(
    () => listFlightDateFacets(searchableRows),
    [searchableRows],
  );

  const suggestions = useMemo(
    () => buildShipmentSearchMatches(searchableRows, matchQuery, searchContext, 8),
    [searchableRows, matchQuery, searchContext],
  );

  const warehouseCounts = useMemo(
    () => countShipmentsByWarehouse(matchedRows),
    [matchedRows],
  );

  const mobileOverlay = compact && open;
  const hasFilterSummary = Boolean(trimmed || flightDateFilter);

  useEffect(() => {
    setActiveIdx(0);
  }, [trimmed, suggestions.length]);

  useEffect(() => {
    if (mobileOverlay) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [mobileOverlay]);

  useEffect(() => {
    if (!mobileOverlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => overlayInputRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [mobileOverlay]);

  const pickMatch = (match: ShipmentSearchMatch) => {
    if (match.kind === "flightDate") {
      const fd = normalizeFlightDateToken(match.shipment.flightDate || "");
      onFlightDateChange?.(fd);
      onChange("");
    } else {
      onChange(match.shipment.awb.trim() || value);
    }
    setOpen(false);
    onSelectMatch?.(match);
  };

  const pickFlightDate = (date: string) => {
    onFlightDateChange?.(date);
    // Nếu ô đang chỉ chứa token ngày bay cũ — xóa để tránh lọc kép.
    if (normalizeFlightDateToken(trimmed) && !trimmed.includes(" ")) {
      onChange("");
    }
  };

  const closeOverlay = () => {
    setOpen(false);
    mergedRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!suggestions.length) return;
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
    }
  };

  const inputClass = `w-full rounded-lg border border-ui-border bg-ui-surface font-medium text-ui-text shadow-ui-sm placeholder:font-normal placeholder:text-ui-text-muted focus:border-ui-primary/40 focus:outline-none focus:ring-2 focus:ring-ui-focus ${
    compact
      ? "min-h-11 touch-manipulation py-1 pl-8 pr-8 text-[13px]"
      : "h-8 py-1 pl-8 pr-8 text-[12px]"
  }`;

  const searchIcon = (
    <svg
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ui-text-muted ${
        compact ? "left-2.5 h-3.5 w-3.5" : "left-2.5 h-4 w-4"
      }`}
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
  );

  const filterSummary =
    hasFilterSummary && matchedRows.length >= 0 ? (
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="text-[10px] font-semibold tabular-nums text-ui-text-muted">
          {matchedRows.length} lô
        </span>
        {flightDateFilter ? (
          <button
            type="button"
            onClick={() => onFlightDateChange?.("")}
            className="inline-flex items-center gap-0.5 rounded-md bg-ui-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-ui-primary"
            title="Bỏ lọc ngày bay"
          >
            {flightDateFilter} ×
          </button>
        ) : null}
        {WAREHOUSE_ORDER.filter((wh) => warehouseCounts[wh] > 0).map((wh) => (
          <span
            key={wh}
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${WAREHOUSE_CHIP_CLASS[wh]}`}
          >
            {warehouseLabel[wh]} {warehouseCounts[wh]}
          </span>
        ))}
      </div>
    ) : null;

  const overlay =
    mobileOverlay && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[520] flex flex-col bg-ui-background"
            role="dialog"
            aria-modal="true"
            aria-label="Tìm kiếm thông minh"
          >
            <div className="border-b border-ui-border bg-ui-surface px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-ui-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-ui-text">Tìm & lọc lô</p>
                <button
                  type="button"
                  onClick={closeOverlay}
                  className="min-h-9 rounded-xl bg-ui-primary px-3.5 text-[12px] font-bold text-white"
                >
                  Xong
                </button>
              </div>
              <div className="relative">
                {searchIcon}
                <input
                  ref={overlayInputRef}
                  type="search"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="MAWB · xe · tài xế · DEST…"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className={inputClass}
                  aria-label="Tìm kiếm thông minh"
                  aria-expanded={suggestions.length > 0}
                  aria-controls={listboxId}
                  role="combobox"
                />
                {trimmed ? (
                  <button
                    type="button"
                    onClick={() => onChange("")}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ui-text-muted hover:bg-ui-surface-muted"
                    aria-label="Xóa tìm kiếm"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="mt-2">
                <FlightDateChips
                  facets={flightFacets}
                  activeDate={activeFlightDate}
                  onPick={pickFlightDate}
                  tight={tightFacets}
                />
              </div>
              {hasFilterSummary ? <div className="mt-2">{filterSummary}</div> : null}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {!trimmed && flightFacets.length ? (
                <p className="text-[11px] text-ui-text-muted">
                  Chọn ngày bay, hoặc gõ MAWB / số xe / tài xế / DEST.
                </p>
              ) : null}
              {trimmed && suggestions.length > 0 ? (
                <SuggestionList
                  id={listboxId}
                  suggestions={suggestions}
                  activeIdx={activeIdx}
                  onPick={pickMatch}
                />
              ) : null}
              {trimmed && suggestions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-ui-border bg-ui-surface px-3 py-6 text-center text-[12px] text-ui-text-muted">
                  Không có lô khớp. Thử MAWB, số xe, tài xế hoặc DEST.
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  const useInline = inlineFacets && !compact;

  const searchField = (
    <div className={`relative ${useInline ? "w-[12.5rem] shrink-0 sm:w-[14rem]" : "w-full"}`}>
      {searchIcon}
      <input
        ref={mergedRef}
        type="search"
        value={compact && open ? value : draftValue}
        onChange={(e) => {
          const next = e.target.value;
          if (compact && open) {
            onChange(next);
          } else {
            queueFilterChange(next);
          }
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={compact ? "MAWB / xe / DEST…" : "MAWB · xe · DEST… (/)"}
        autoComplete="off"
        spellCheck={false}
        readOnly={compact && open}
        className={inputClass}
        aria-label="Tìm kiếm thông minh MAWB, số xe, tài xế, DEST"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listboxId}
        role="combobox"
      />
      {trimmed ? (
        <button
          type="button"
          onClick={() => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            queueFilterChange("");
            setOpen(false);
            mergedRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
          aria-label="Xóa tìm kiếm"
        >
          ×
        </button>
      ) : (
        <kbd
          className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-ui-border bg-ui-surface-muted px-1 py-px text-[9px] font-semibold leading-none text-ui-text-muted sm:inline-block"
          title="Nhấn / hoặc F để tìm nhanh"
        >
          /
        </kbd>
      )}
    </div>
  );

  const flightChips =
    flightFacets.length > 0 ? (
      <FlightDateChips
        facets={flightFacets}
        activeDate={activeFlightDate}
        onPick={(date) => {
          pickFlightDate(date);
          if (compact) setOpen(false);
        }}
        tight={tightFacets}
      />
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${
        compact ? "w-full flex-1" : useInline ? "w-auto shrink-0" : "w-full max-w-xs"
      }`}
    >
      {useInline ? (
        <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {searchField}
          {flightChips}
          {hasFilterSummary ? filterSummary : null}
        </div>
      ) : (
        <>
          {searchField}
          {flightChips ? <div className="mt-1">{flightChips}</div> : null}
          {hasFilterSummary ? <div className="mt-0.5">{filterSummary}</div> : null}
        </>
      )}

      {!compact && open && trimmed && suggestions.length > 0 ? (
        <div className={`absolute z-50 mt-1 ${useInline ? "left-0 w-[min(100%,22rem)]" : "left-0 right-0"}`}>
          <SuggestionList
            id={listboxId}
            suggestions={suggestions}
            activeIdx={activeIdx}
            onPick={pickMatch}
          />
        </div>
      ) : null}

      {overlay}
    </div>
  );
}
