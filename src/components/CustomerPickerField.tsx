import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  CUSTOMER_SUGGEST_LIMIT,
  CustomerSuggestDropdown,
  filterCustomerDirectoryEntries,
  useCustomerSuggestAnchor,
  useCustomerSuggestKeyboard,
} from "./CustomerSuggestDropdown";

interface CustomerPickerFieldProps {
  value: string;
  customerId?: string;
  directory: readonly CustomerDirectoryEntry[];
  onChange: (name: string, entry?: CustomerDirectoryEntry) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onTabNavigateNext?: () => void;
}

/** Ô chọn khách có gợi ý — dùng form mobile / modal. */
export function CustomerPickerField({
  value,
  customerId = "",
  directory,
  onChange,
  placeholder = "Tìm mã hoặc tên khách…",
  className = "",
  inputClassName = "",
  autoFocus = false,
  onTabNavigateNext,
}: CustomerPickerFieldProps) {
  const [draft, setDraft] = useState(value);
  const [listOpen, setListOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const skipBlurCommitRef = useRef(false);

  const suggestions = useMemo(
    () => filterCustomerDirectoryEntries(directory, draft, CUSTOMER_SUGGEST_LIMIT, customerId),
    [customerId, directory, draft]
  );
  const hasSuggestions = directory.length > 0 && suggestions.length > 0;
  const showList = listOpen && hasSuggestions;
  const anchor = useCustomerSuggestAnchor(inputRef, showList);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useLayoutEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    setListOpen(directory.length > 0);
  }, [autoFocus, directory.length]);

  useEffect(() => {
    setActiveIdx(0);
  }, [draft]);

  const pick = (entry: CustomerDirectoryEntry, advance?: () => void) => {
    skipBlurCommitRef.current = true;
    setDraft(entry.name);
    onChange(entry.name, entry);
    setListOpen(false);
    queueMicrotask(() => {
      skipBlurCommitRef.current = false;
      advance?.();
    });
  };

  const commitTyped = (advance?: () => void) => {
    skipBlurCommitRef.current = true;
    const trimmed = draft.trim();
    onChange(trimmed);
    setListOpen(false);
    queueMicrotask(() => {
      skipBlurCommitRef.current = false;
      advance?.();
    });
  };

  const pickActive = (advance?: () => void) => {
    const hit = suggestions[activeIdx];
    if (hit) pick(hit, advance);
    else commitTyped(advance);
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

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          setListOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setListOpen(true)}
        onBlur={() => {
          if (skipBlurCommitRef.current) return;
          window.setTimeout(() => {
            if (!listRef.current?.contains(document.activeElement)) {
              commitTyped();
            }
          }, 120);
        }}
        onKeyDown={(e) => {
          if (handleSuggestKeyDown(e)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            commitTyped();
          }
        }}
        className={inputClassName}
        aria-autocomplete="list"
        aria-expanded={showList}
      />
      <CustomerSuggestDropdown
        open={listOpen}
        anchor={anchor}
        query={draft}
        directory={directory}
        activeIdx={activeIdx}
        selectedId={customerId}
        onPick={(entry) => pick(entry)}
        onActiveIdxChange={setActiveIdx}
        listRef={listRef}
      />
    </div>
  );
}
