import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { runInlineAsyncCommit } from "../utils/inlineCommitAsync";
import { CellStatusDot, type CellStatus } from "./CellStatusDot";
import type { GridNavDirection } from "../hooks/useGridNavigation";

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
  onNavigate?: (dir: GridNavDirection) => void;
  validate?: (v: string) => string | null;
  title?: string;
  cellStatus?: CellStatus;
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
  onNavigate,
  validate,
  title,
  cellStatus,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
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
    runInlineAsyncCommit(result, {
      setEditing,
      onReject: () => {
        setDraft(value);
        setError("Không lưu được — thử lại.");
      },
    });
  };

  const gridProps = gridNav
    ? { "data-grid-row": gridNav.rowId, "data-grid-field": gridNav.field }
    : {};

  const btnBase =
    "ops-inline-edit relative block w-full max-w-full truncate whitespace-nowrap rounded px-1 py-0.5 text-left";
  const shown = (displayValue ?? value).trim();
  const editLabel = title || (placeholder && placeholder !== "—" ? `Sửa ${placeholder}` : "Sửa");

  if (!editing) {
    return (
      <button
        type="button"
        {...gridProps}
        aria-label={editLabel}
        title={title || (value ? `${value} — click để sửa` : "Click để sửa")}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onNavigate?.("up");
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onNavigate?.("down");
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            onNavigate?.("left");
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onNavigate?.("right");
          } else if (e.key === "Tab") {
            e.preventDefault();
            onNavigate?.(e.shiftKey ? "prev" : "next");
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.key === "n" || e.key === "N" || e.key === "/") {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            setDraft(uppercase ? e.key.toUpperCase() : e.key);
            setEditing(true);
          }
        }}
        className={`${btnBase} focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${className} ${
          value === "" ? "ops-grid-placeholder" : ""
        }`}
      >
        <span className="truncate">{shown !== "" ? shown : placeholder}</span>
        <CellStatusDot status={cellStatus} />
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
              if (!error) {
                if (onNavigate) onNavigate("down");
                else onEnterNavigateDown?.();
              }
            });
            return;
          }
          if (e.key === "Tab") {
            e.preventDefault();
            commit();
            queueMicrotask(() => {
              if (!error) onNavigate?.(e.shiftKey ? "prev" : "next");
            });
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setError(null);
            setEditing(false);
            return;
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-xl border-2 bg-white px-1.5 py-0.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20 ${
          error ? "border-red-400" : "border-apple-blue"
        } ${className}`}
        aria-invalid={Boolean(error)}
      />
      <CellStatusDot status={cellStatus} />
      {error ? (
        <span className="mt-0.5 text-2xs font-semibold text-red-600">{error}</span>
      ) : null}
    </span>
  );
}
