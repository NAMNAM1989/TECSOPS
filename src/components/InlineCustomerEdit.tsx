import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  buildShipmentPatchForCustomerSelection,
  customerNameWhileTyping,
  filterCustomerDirectoryEntries,
  normalizeCustomerNameInput,
} from "../utils/customerShipmentPatch";
import {
  CUSTOMER_SUGGEST_LIMIT,
  CustomerSuggestDropdown,
  useCustomerSuggestAnchor,
  useCustomerSuggestKeyboard,
} from "./CustomerSuggestDropdown";

interface Props {
  value: string;
  customerId?: string;
  profileSelection?: Pick<
    Shipment,
    "customerShipperId" | "customerConsigneeId" | "customerGoodsId"
  >;
  customerDirectory: readonly CustomerDirectoryEntry[];
  placeholder?: string;
  onCommit: (patch: Partial<Shipment>) => void;
  className?: string;
  maxLength?: number;
  gridNav?: { rowId: string; field: string };
  onEnterNavigateDown?: () => void;
  /** Sau Tab chọn gợi ý — thường focus ô kế (NOTE). */
  onTabNavigateNext?: () => void;
}

export function InlineCustomerEdit({
  value,
  customerId = "",
  profileSelection,
  customerDirectory,
  placeholder = "Khách",
  onCommit,
  className = "",
  maxLength = 120,
  gridNav,
  onEnterNavigateDown,
  onTabNavigateNext,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [listOpen, setListOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const skipBlurCommitRef = useRef(false);

  const suggestions = useMemo(
    () => filterCustomerDirectoryEntries(customerDirectory, draft, CUSTOMER_SUGGEST_LIMIT, customerId),
    [customerDirectory, customerId, draft]
  );
  const hasSuggestions = customerDirectory.length > 0 && suggestions.length > 0;
  const showList = listOpen && hasSuggestions;
  const anchor = useCustomerSuggestAnchor(inputRef, showList);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    setDraft(normalizeCustomerNameInput(value));
    el.focus();
    el.select();
    setListOpen(customerDirectory.length > 0);
    setActiveIdx(0);
  }, [customerDirectory.length, editing]);

  useEffect(() => {
    setActiveIdx(0);
  }, [draft]);

  const applyEntry = (entry: CustomerDirectoryEntry, advance?: () => void) => {
    skipBlurCommitRef.current = true;
    setEditing(false);
    setListOpen(false);
    onCommit(
      buildShipmentPatchForCustomerSelection(
        customerDirectory,
        entry.name,
        entry,
        profileSelection
      )
    );
    queueMicrotask(() => {
      skipBlurCommitRef.current = false;
      advance?.();
    });
  };

  const commitDraft = (advance?: () => void) => {
    skipBlurCommitRef.current = true;
    setEditing(false);
    setListOpen(false);
    const trimmed = normalizeCustomerNameInput(draft).slice(0, maxLength);
    if (trimmed !== normalizeCustomerNameInput(value) || !customerId) {
      onCommit(
        buildShipmentPatchForCustomerSelection(
          customerDirectory,
          trimmed,
          undefined,
          profileSelection
        )
      );
    }
    queueMicrotask(() => {
      skipBlurCommitRef.current = false;
      advance?.();
    });
  };

  const pickActive = (advance?: () => void) => {
    const hit = suggestions[activeIdx];
    if (hit) applyEntry(hit, advance);
    else commitDraft(advance);
  };

  const handleSuggestKeyDown = useCustomerSuggestKeyboard({
    open: showList,
    suggestionCount: suggestions.length,
    activeIdx,
    setActiveIdx,
    onPickActive: () => pickActive(),
    onTabPick: () => pickActive(onTabNavigateNext),
    onClose: () => setListOpen(false),
  });

  const gridProps = gridNav
    ? { "data-grid-row": gridNav.rowId, "data-grid-field": gridNav.field }
    : {};

  const btnBase = "w-full rounded px-1 py-0.5 text-left";

  const displayValue = value !== "" ? normalizeCustomerNameInput(value) : "";

  if (!editing) {
    return (
      <button
        type="button"
        {...gridProps}
        onFocus={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={`${btnBase} hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/30 dark:hover:bg-white/[0.08] ${className} ${
          displayValue === "" ? "ops-grid-placeholder" : ""
        }`}
      >
        {displayValue !== "" ? displayValue : placeholder}
      </button>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        {...gridProps}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => {
          setDraft(customerNameWhileTyping(e.target.value));
          setListOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setListOpen(true)}
        onBlur={(e) => {
          if (skipBlurCommitRef.current) return;
          const next = e.relatedTarget as Node | null;
          if (next && listRef.current?.contains(next)) return;
          commitDraft();
        }}
        onKeyDown={(e) => {
          if (handleSuggestKeyDown(e)) return;
          if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
            e.preventDefault();
            commitDraft(onEnterNavigateDown);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
            setListOpen(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20 dark:bg-ops-elevated dark:text-zinc-100 ${className}`}
        aria-label="Khách hàng"
        aria-autocomplete="list"
        aria-expanded={showList}
      />
      <CustomerSuggestDropdown
        open={listOpen}
        anchor={anchor}
        query={draft}
        directory={customerDirectory}
        activeIdx={activeIdx}
        selectedId={customerId}
        onPick={(entry) => applyEntry(entry)}
        onActiveIdxChange={setActiveIdx}
        listRef={listRef}
      />
    </>
  );
}
