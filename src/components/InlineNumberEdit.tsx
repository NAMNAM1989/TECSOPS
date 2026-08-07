import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Props {
  value: number | null;
  placeholder?: string;
  onCommit: (v: number | null) => void | Promise<boolean | void>;
  className?: string;
  /** Thu gọn cho hàng mobile 1–2 dòng */
  compact?: boolean;
  /** Ô lưới desktop — input gọn, viền mỏng */
  variant?: "default" | "grid";
  /** Điều hướng bảng desktop (Excel): data-grid-row / data-grid-field */
  gridNav?: { rowId: string; field: string };
  /** Enter sau khi commit: ví dụ nhảy xuống ô cùng cột hàng dưới */
  onEnterNavigateDown?: () => void;
  /** Validation — trả message lỗi để giữ chế độ edit. */
  validate?: (v: number | null) => string | null;
  title?: string;
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
  validate,
  title,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== null ? String(value) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    if (saving) return;
    const trimmed = draft.trim();
    const next: number | null =
      trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (trimmed !== "" && Number.isNaN(next)) {
      setError("Số không hợp lệ.");
      return;
    }
    const err = validate?.(next) ?? null;
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (next === value || (next == null && value == null)) {
      setEditing(false);
      return;
    }
    const result = onCommit(next);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaving(true);
      void (result as Promise<boolean | void>)
        .then((ok) => {
          if (ok === false) {
            setDraft(value !== null ? String(value) : "");
            setError("Không lưu được — thử lại.");
            return;
          }
          setEditing(false);
        })
        .finally(() => setSaving(false));
      return;
    }
    setEditing(false);
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
        title={title || "Click để sửa"}
        onFocus={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={`${btnBase} hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/30 ${className} ${
          value === null ? "ops-grid-placeholder" : ""
        } ${saving ? "opacity-60" : ""}`}
      >
        {saving ? "…" : value !== null ? value.toLocaleString() : emptyLabel}
      </button>
    );
  }

  const inputCls =
    variant === "grid"
      ? "w-full min-w-[2.5rem] rounded border border-black/[0.12] bg-white px-1 py-0 text-right text-[11px] font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-apple-blue/35"
      : compact
        ? "inline-block w-14 rounded-lg border border-apple-blue bg-white px-1 py-0.5 text-right text-[11px] font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/25"
        : "w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 text-right text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20";

  return (
    <span className="relative inline-flex w-full flex-col items-stretch">
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        {...gridProps}
        value={draft}
        disabled={saving}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !(e.nativeEvent as KeyboardEvent).isComposing
          ) {
            e.preventDefault();
            commit();
            queueMicrotask(() => {
              if (!error) onEnterNavigateDown?.();
            });
            return;
          }
          if (e.key === "Escape") {
            setDraft(value !== null ? String(value) : "");
            setError(null);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={`${inputCls} ${error ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
        step="any"
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <span className="mt-0.5 text-[9px] font-semibold leading-tight text-rose-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
