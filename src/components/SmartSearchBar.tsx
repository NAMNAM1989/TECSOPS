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
  /** Lô trong ngày (trước lọc kho / sau lọc trạng thái nếu có). */
  searchableRows: readonly Shipment[];
  /** Lô khớp sau khi áp dụng tìm kiếm — dùng hiển thị phân bổ kho. */
  matchedRows: readonly Shipment[];
  searchContext: ShipmentSearchContext;
  inputRef?: RefObject<HTMLInputElement>;
  onSelectMatch?: (match: ShipmentSearchMatch) => void;
  /** Gọn — mobile header */
  compact?: boolean;
}

function FlightDateChips({
  facets,
  activeDate,
  onPick,
  dense = false,
}: {
  facets: ReturnType<typeof listFlightDateFacets>;
  activeDate: string;
  onPick: (date: string) => void;
  dense?: boolean;
}) {
  if (!facets.length) return null;
  return (
    <div className="min-w-0">
      <p
        className={`mb-1 font-bold uppercase tracking-wide text-ui-text-muted ${
          dense ? "text-[9px]" : "text-[10px]"
        }`}
      >
        Ngày bay
      </p>
      <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {facets.map((f) => {
          const active = activeDate === f.date;
          return (
            <button
              key={f.date}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(active ? "" : f.date)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ring-1 transition active:scale-[0.98] ${
                active
                  ? "bg-ui-primary text-white ring-ui-primary"
                  : "bg-ui-surface text-ui-text ring-ui-border hover:bg-emerald-50 hover:ring-emerald-300/70"
              } ${dense ? "min-h-8" : "min-h-9"}`}
              aria-pressed={active}
              title={
                active
                  ? `Bỏ lọc ngày bay ${f.date}`
                  : `Lọc ${f.count} lô ngày bay ${f.date}`
              }
            >
              <span>{f.date}</span>
              <span
                className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${
                  active ? "bg-white/20 text-white" : "bg-ui-surface-muted text-ui-text-muted"
                }`}
              >
                {f.count}
              </span>
            </button>
          );
        })}
      </div>
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
      className="max-h-[min(50vh,20rem)] overflow-auto rounded-2xl border border-ui-border bg-ui-surface py-1 shadow-apple-md"
    >
      {suggestions.map((match, idx) => (
        <li key={match.shipment.id} role="option" aria-selected={idx === activeIdx}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(match)}
            className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors ${
              idx === activeIdx ? "bg-ui-primary/10" : "hover:bg-ui-surface-muted"
            }`}
          >
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${WAREHOUSE_CHIP_CLASS[match.shipment.warehouse]}`}
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
  searchableRows,
  matchedRows,
  searchContext,
  inputRef,
  onSelectMatch,
  compact = false,
}: SmartSearchBarProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const mergedRef = inputRef ?? localRef;
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const trimmed = value.trim();
  const activeFlightDate = normalizeFlightDateToken(trimmed);
  const flightFacets = useMemo(
    () => listFlightDateFacets(searchableRows),
    [searchableRows],
  );

  const suggestions = useMemo(
    () => buildShipmentSearchMatches(searchableRows, trimmed, searchContext, 8),
    [searchableRows, trimmed, searchContext],
  );

  const warehouseCounts = useMemo(
    () => countShipmentsByWarehouse(matchedRows),
    [matchedRows],
  );

  const mobileOverlay = compact && open;

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
    onChange(match.shipment.awb.trim() || value);
    setOpen(false);
    onSelectMatch?.(match);
  };

  const pickFlightDate = (date: string) => {
    onChange(date);
    setOpen(true);
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

  const inputClass = `w-full rounded-full border border-ui-border bg-ui-surface font-medium text-ui-text shadow-ui-sm placeholder:font-normal placeholder:text-ui-text-muted focus:border-ui-primary/40 focus:outline-none focus:ring-2 focus:ring-ui-focus ${
    compact
      ? "h-9 py-1 pl-8 pr-8 text-[12px]"
      : "h-10 py-2 pl-10 pr-10 text-[13px]"
  }`;

  const searchIcon = (
    <svg
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ui-text-muted ${
        compact ? "left-2.5 h-3.5 w-3.5" : "left-3 h-4 w-4"
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
                  placeholder="MAWB · ngày bay 28JUL · xe · tài xế…"
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
                  dense
                />
              </div>
              {trimmed ? (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-semibold text-ui-text-muted">
                    {matchedRows.length} lô khớp
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
              ) : null}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {!trimmed && flightFacets.length ? (
                <p className="text-[11px] text-ui-text-muted">
                  Chọn ngày bay bên trên, hoặc gõ MAWB / số xe / tài xế.
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
                <p className="rounded-2xl border border-dashed border-ui-border bg-ui-surface px-3 py-6 text-center text-[12px] text-ui-text-muted">
                  Không có lô khớp. Thử ngày bay (28JUL), MAWB, số xe hoặc tài xế.
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative min-w-0 w-full flex-1">
      <div className="relative">
        {searchIcon}
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
          placeholder={
            compact
              ? "MAWB / ngày bay / xe…"
              : "MAWB · ngày bay 28JUL · số xe · tài xế… (/ hoặc F)"
          }
          autoComplete="off"
          spellCheck={false}
          readOnly={compact && open}
          className={inputClass}
          aria-label="Tìm kiếm thông minh MAWB, ngày bay, số xe, tài xế"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listboxId}
          role="combobox"
        />
        {trimmed ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
              mergedRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
            aria-label="Xóa tìm kiếm"
          >
            ×
          </button>
        ) : (
          <kbd
            className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-ui-border bg-ui-surface-muted px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ui-text-muted sm:inline-block"
            title="Nhấn / hoặc F để tìm nhanh"
          >
            /
          </kbd>
        )}
      </div>

      {/* Mobile: chip ngày bay luôn thấy dưới ô search — không cần mở overlay */}
      {compact && !mobileOverlay && flightFacets.length > 0 ? (
        <div className="mt-1">
          <FlightDateChips
            facets={flightFacets}
            activeDate={activeFlightDate}
            onPick={(date) => {
              pickFlightDate(date);
              setOpen(false);
            }}
            dense
          />
          {trimmed ? (
            <p className="mt-0.5 text-[10px] font-semibold text-ui-text-muted">
              {matchedRows.length} lô khớp
            </p>
          ) : null}
        </div>
      ) : null}

      {!compact ? (
        <div className="mt-1.5 space-y-1.5">
          {(open || activeFlightDate) && flightFacets.length > 0 ? (
            <FlightDateChips
              facets={flightFacets}
              activeDate={activeFlightDate}
              onPick={pickFlightDate}
            />
          ) : null}
          {trimmed && matchedRows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-1">
              <span className="text-[10px] font-semibold text-ui-text-muted">
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
          ) : null}
        </div>
      ) : null}

      {!compact && open && trimmed && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 z-50 mt-1.5">
          <SuggestionList
            id={listboxId}
            suggestions={suggestions}
            activeIdx={activeIdx}
            onPick={pickMatch}
          />
        </div>
      ) : null}

      {!compact && trimmed && suggestions.length === 0 ? (
        <p className="mt-1 text-center text-[10px] text-ui-text-muted">
          Không tìm thấy lô khớp MAWB/HAWB, ngày bay, số xe hoặc tài xế.
        </p>
      ) : null}

      {overlay}
    </div>
  );
}
