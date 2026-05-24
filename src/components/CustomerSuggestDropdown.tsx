import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { filterCustomerDirectoryEntries } from "../utils/customerShipmentPatch";

export const CUSTOMER_SUGGEST_LIMIT = 12;

type SuggestAnchor = { left: number; top: number; width: number };

interface CustomerSuggestDropdownProps {
  open: boolean;
  anchor: SuggestAnchor | null;
  query: string;
  directory: readonly CustomerDirectoryEntry[];
  activeIdx: number;
  selectedId?: string;
  onPick: (entry: CustomerDirectoryEntry) => void;
  onActiveIdxChange: (idx: number) => void;
  listRef?: RefObject<HTMLDivElement>;
}

export function CustomerSuggestDropdown({
  open,
  anchor,
  query,
  directory,
  activeIdx,
  selectedId,
  onPick,
  onActiveIdxChange,
  listRef,
}: CustomerSuggestDropdownProps) {
  const suggestions = useMemo(
    () => filterCustomerDirectoryEntries(directory, query, CUSTOMER_SUGGEST_LIMIT, selectedId),
    [directory, query, selectedId]
  );

  useEffect(() => {
    if (activeIdx >= suggestions.length) onActiveIdxChange(0);
  }, [activeIdx, onActiveIdxChange, suggestions.length]);

  if (!open || !anchor || suggestions.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      style={{
        position: "fixed",
        left: anchor.left,
        top: anchor.top + 4,
        width: Math.max(anchor.width, 240),
        zIndex: 520,
      }}
      className="max-h-56 overflow-auto rounded-xl border border-black/[0.08] bg-white py-1 shadow-apple-md dark:border-white/10 dark:bg-ops-elevated"
    >
      <p className="border-b border-black/[0.06] px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-apple-tertiary dark:border-white/[0.06] dark:text-ops-tertiary">
        Tab chọn · ↑↓ lọc
      </p>
      {suggestions.map((entry, idx) => (
        <button
          key={entry.id}
          type="button"
          role="option"
          aria-selected={idx === activeIdx}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onActiveIdxChange(idx)}
          onClick={() => onPick(entry)}
          className={`block w-full px-3 py-2 text-left transition-colors ${
            idx === activeIdx
              ? "bg-apple-blue/10 ring-1 ring-inset ring-apple-blue/25 dark:bg-apple-blue/15"
              : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
          } ${selectedId === entry.id ? "font-bold" : ""}`}
        >
          <span className="font-mono text-[10px] font-semibold text-apple-secondary dark:text-ops-secondary">
            {entry.code}
          </span>
          <span className="mx-1.5 text-apple-tertiary">·</span>
          <span className="text-[12px] font-semibold text-apple-label dark:text-ops-label">{entry.name}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

export function useCustomerSuggestAnchor(inputRef: RefObject<HTMLInputElement>, open: boolean) {
  const [anchor, setAnchor] = useState<SuggestAnchor | null>(null);

  const updateAnchor = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({ left: rect.left, top: rect.bottom, width: rect.width });
  }, [inputRef]);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    updateAnchor();
  }, [open, updateAnchor]);

  useEffect(() => {
    if (!open) return;
    const onReflow = () => updateAnchor();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, updateAnchor]);

  return anchor;
}

type CustomerSuggestKeyboardOpts = {
  open: boolean;
  suggestionCount: number;
  activeIdx: number;
  setActiveIdx: (idx: number) => void;
  onPickActive: () => void;
  onTabPick?: () => void;
  onClose: () => void;
};

export function useCustomerSuggestKeyboard({
  open,
  suggestionCount,
  activeIdx,
  setActiveIdx,
  onPickActive,
  onTabPick,
  onClose,
}: CustomerSuggestKeyboardOpts) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || suggestionCount === 0) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((activeIdx + 1) % suggestionCount);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((activeIdx - 1 + suggestionCount) % suggestionCount);
        return true;
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        if (onTabPick) onTabPick();
        else onPickActive();
        return true;
      }
      if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
        e.preventDefault();
        onPickActive();
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return true;
      }
      return false;
    },
    [activeIdx, onClose, onPickActive, onTabPick, open, setActiveIdx, suggestionCount]
  );
}

export { filterCustomerDirectoryEntries };
