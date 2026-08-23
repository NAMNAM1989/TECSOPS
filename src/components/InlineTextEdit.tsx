import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Props {
  value: string;
  /** Text hiển thị khi không edit (vd. cắt ngắn trên lưới). Mặc định = value. */
  displayValue?: string;
  placeholder?: string;
  onCommit: (v: string) => void | Promise<boolean | void>;
  className?: string;
  /** Viết hoa khi commit (DEST, chuyến bay) */
  uppercase?: boolean;
  maxLength?: number;
  /** Điều hướng bảng desktop: gắn data-grid-row / data-grid-field */
  gridNav?: { rowId: string; field: string };
  /** Sau Enter (đã commit), ví dụ focus ô cùng cột hàng dưới */
  onEnterNavigateDown?: () => void;
  validate?: (v: string) => string | null;
  title?: string;
}

export function InlineTextEdit({
  value,
  displayValue,
  placeholder = "—",
  onCommit,
  className = "",
  uppercase = false,
  maxLength,
  gridNav,
  onEnterNavigateDown,
  validate,
  title,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    if (saving) return;
    let t = draft.trim();
    if (uppercase) t = t.toUpperCase();
    if (maxLength != null) t = t.slice(0, maxLength);
    const err = validate?.(t) ?? null;
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (t === value.trim()) {
      setEditing(false);
      return;
    }
    const result = onCommit(t);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaving(true);
      void (result as Promise<boolean | void>)
        .then((ok) => {
          if (ok === false) {
            setDraft(value);
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
    "ops-inline-edit block w-full max-w-full truncate whitespace-nowrap rounded px-1 py-0.5 text-left";
  const shown = (displayValue ?? value).trim();
  const editLabel = title || (placeholder && placeholder !== "—" ? `Sửa ${placeholder}` : "Sửa");

  if (!editing) {
    return (
      <button
        type="button"
        {...gridProps}
        aria-label={editLabel}
        title={title || (value ? `${value} — click để sửa` : "Click để sửa")}
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
        className={`${btnBase} focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${className} ${
          value === "" ? "ops-grid-placeholder" : ""
        } ${saving ? "opacity-60" : ""}`}
      >
        {saving ? "…" : shown !== "" ? shown : placeholder}
      </button>
    );
  }

  return (
    <span className="relative inline-flex w-full flex-col">
      <input
        ref={ref}
        type="text"
        {...gridProps}
        value={draft}
        maxLength={maxLength}
        disabled={saving}
        onChange={(e) => {
          setDraft(uppercase ? e.target.value.toUpperCase() : e.target.value);
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
          }
          if (e.key === "Escape") {
            setDraft(value);
            setError(null);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-xl border-2 bg-white px-1.5 py-0.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20 ${
          error ? "border-rose-400" : "border-apple-blue"
        } ${className}`}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <span className="mt-0.5 text-[9px] font-semibold text-rose-600">{error}</span>
      ) : null}
    </span>
  );
}
