import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Props {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  className?: string;
  /** Viết hoa khi commit (DEST, chuyến bay) */
  uppercase?: boolean;
  maxLength?: number;
  /** Điều hướng bảng desktop: gắn data-grid-row / data-grid-field */
  gridNav?: { rowId: string; field: string };
  /** Sau Enter (đã commit), ví dụ focus ô cùng cột hàng dưới */
  onEnterNavigateDown?: () => void;
}

export function InlineTextEdit({
  value,
  placeholder = "—",
  onCommit,
  className = "",
  uppercase = false,
  maxLength,
  gridNav,
  onEnterNavigateDown,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    let t = draft.trim();
    if (uppercase) t = t.toUpperCase();
    if (maxLength != null) t = t.slice(0, maxLength);
    if (t !== value.trim()) onCommit(t);
  };

  const gridProps = gridNav
    ? { "data-grid-row": gridNav.rowId, "data-grid-field": gridNav.field }
    : {};

  const btnBase = "w-full rounded px-1 py-0.5 text-left";

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
        className={`${btnBase} hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/30 ${className} ${
          value === "" ? "italic text-apple-tertiary" : ""
        }`}
      >
        {value !== "" ? value : placeholder}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      type="text"
      {...gridProps}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
          e.preventDefault();
          commit();
          queueMicrotask(() => onEnterNavigateDown?.());
        }
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={`w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20 ${className}`}
    />
  );
}
