import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { OPS } from "../styles/opsModalStyles";

export type ComboboxOption = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboboxOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  /** live = patch mỗi keystroke; blur = chỉ commit khi blur/Enter/chọn gợi ý */
  commitMode?: "live" | "blur";
  onPickOption?: (option: ComboboxOption) => void;
};

export const SearchCombobox = memo(function SearchCombobox({
  value,
  onChange,
  options,
  placeholder = "",
  className = "",
  inputClassName = "",
  disabled = false,
  allowCustom = true,
  commitMode = "live",
  onPickOption,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!focused) setQuery(value);
  }, [focused, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 24);
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q) ||
          (o.hint ?? "").toLowerCase().includes(q)
      )
      .slice(0, 24);
  }, [options, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = useCallback(
    (opt: ComboboxOption) => {
      const display = opt.label || opt.value;
      setQuery(display);
      setOpen(false);
      if (onPickOption) {
        onPickOption(opt);
      } else {
        onChange(opt.value);
      }
    },
    [onChange, onPickOption]
  );

  const commitQuery = useCallback(() => {
    if (allowCustom) onChange(query);
    setOpen(false);
  }, [allowCustom, onChange, query]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[activeIdx]) pick(filtered[activeIdx]);
      else commitQuery();
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (commitMode === "live" && allowCustom) onChange(e.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          window.setTimeout(() => {
            setOpen(false);
            if (!allowCustom) return;
            if (commitMode === "blur" || query !== value) onChange(query);
          }, 120);
        }}
        onKeyDown={onKeyDown}
        className={`${OPS.input} w-full min-w-0 py-1 text-[11px] ${inputClassName}`}
      />
      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-ops-elevated"
        >
          {filtered.map((opt, idx) => (
            <li key={`${opt.value}-${idx}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left ${
                  idx === activeIdx
                    ? "bg-indigo-500/10 dark:bg-indigo-400/15"
                    : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                <span className="truncate text-[11px] font-medium text-slate-900 dark:text-slate-100">
                  {opt.label}
                </span>
                {opt.hint ? (
                  <span className="truncate text-[9px] text-slate-500">{opt.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
