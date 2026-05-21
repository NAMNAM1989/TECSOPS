import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Props {
  value: number | null;
  placeholder?: string;
  onCommit: (v: number | null) => void;
  className?: string;
  /** Thu gọn cho hàng mobile 1–2 dòng */
  compact?: boolean;
  /** Ô lưới desktop — input gọn, viền mỏng */
  variant?: "default" | "grid";
  /** Điều hướng bảng desktop (Excel): data-grid-row / data-grid-field */
  gridNav?: { rowId: string; field: string };
  /** Enter sau khi commit: ví dụ nhảy xuống ô cùng cột hàng dưới */
  onEnterNavigateDown?: () => void;
}

export function InlineNumberEdit({
  value,
  placeholder = "",
  onCommit,
  className = "",
  compact = false,
  variant = "default",
  gridNav,
  onEnterNavigateDown,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== null ? String(value) : "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value !== null ? String(value) : "");
  }, [value, editing]);

  /** useLayoutEffect: chuyển focus từ nút sang input ngay khi Tab (tránh mất focus một nhịp). */
  useLayoutEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (value !== null) onCommit(null);
      return;
    }
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isNaN(n) && n !== value) onCommit(n);
  };

  const gridProps = gridNav
    ? { "data-grid-row": gridNav.rowId, "data-grid-field": gridNav.field }
    : {};

  const btnBase =
    variant === "grid"
      ? "inline-flex min-w-[2rem] justify-end rounded px-0.5 py-0 text-right leading-none"
      : compact
        ? "inline-flex min-w-[2rem] max-w-[4rem] justify-end rounded px-0.5 py-0 text-[11px] leading-none font-bold tabular-nums"
        : "w-full rounded px-1 py-0.5 text-right";

  const emptyLabel = placeholder || "\u00a0";

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
          value === null ? "ops-grid-placeholder" : "dark:text-zinc-100"
        }`}
      >
        {value !== null ? value.toLocaleString() : emptyLabel}
      </button>
    );
  }

  const inputCls =
    variant === "grid"
      ? "w-full min-w-[2.5rem] rounded border border-black/[0.12] bg-white px-1 py-0 text-right text-[11px] font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-apple-blue/35 dark:border-white/15 dark:bg-ops-elevated dark:text-zinc-100"
      : compact
        ? "inline-block w-14 rounded-lg border border-apple-blue bg-white px-1 py-0.5 text-right text-[11px] font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/25 dark:bg-ops-elevated dark:text-zinc-100"
        : "w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 text-right text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20 dark:bg-ops-elevated dark:text-zinc-100";

  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      {...gridProps}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
          e.preventDefault();
          commit();
          queueMicrotask(() => onEnterNavigateDown?.());
          return;
        }
        if (e.key === "Escape") {
          setDraft(value !== null ? String(value) : "");
          setEditing(false);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={inputCls}
      step="any"
    />
  );
}
