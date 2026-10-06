import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatGroupedNumber } from "../utils/formatNumber";
import { runInlineAsyncCommit } from "../utils/inlineCommitAsync";
import { CellStatusDot, type CellStatus } from "./CellStatusDot";
import type { GridNavDirection } from "../hooks/useGridNavigation";

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
  onNavigate?: (dir: GridNavDirection) => void;
  /** Validation — trả message lỗi để giữ chế độ edit. */
  validate?: (v: number | null) => string | null;
  title?: string;
  cellStatus?: CellStatus;
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
  onNavigate,
  validate,
  title,
  cellStatus,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== null ? String(value) : "");
  const [error, setError] = useState<string | null>(null);
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
    runInlineAsyncCommit(result, {
      setEditing,
      onReject: () => {
        setDraft(value !== null ? String(value) : "");
        setError("Không lưu được — thử lại.");
      },
    });
  };

  const gridProps = gridNav
    ? { "data-grid-row": gridNav.rowId, "data-grid-field": gridNav.field }
    : {};

  const btnBase =
    variant === "grid"
      ? "ops-inline-edit relative inline-flex min-w-[2rem] justify-end rounded px-0.5 py-0 text-right leading-none tabular-nums"
      : compact
        ? "ops-inline-edit relative inline-flex min-w-[2rem] max-w-[4rem] justify-end rounded px-0.5 py-0 text-2xs leading-none font-bold tabular-nums"
        : "ops-inline-edit relative w-full rounded px-1 py-0.5 text-right";

  const emptyLabel = placeholder || "\u00a0";

  if (!editing) {
    return (
      <button
        type="button"
        {...gridProps}
        aria-label={title || "Sửa"}
        title={title || "Click để sửa"}
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
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /[0-9.,]/.test(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            setDraft(e.key);
            setEditing(true);
          }
        }}
        className={`${btnBase} focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${className} ${
          value === null ? "ops-grid-placeholder" : ""
        }`}
      >
        <span>{typeof value === "number" ? formatGroupedNumber(value, { maxFractionDigits: 3 }) : emptyLabel}</span>
        <CellStatusDot status={cellStatus} />
      </button>
    );
  }

  const inputCls =
    variant === "grid"
      ? "w-full min-w-[2.5rem] rounded border border-black/[0.12] bg-white px-1 py-0 text-right text-2xs font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-apple-blue/35"
      : compact
        ? "inline-block w-14 rounded-lg border border-apple-blue bg-white px-1 py-0.5 text-right text-2xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/25"
        : "w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 text-right text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20";

  return (
    <span className="relative inline-flex w-full flex-col items-stretch">
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        {...gridProps}
        value={draft}
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
            setDraft(value !== null ? String(value) : "");
            setError(null);
            setEditing(false);
            return;
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={`${inputCls} ${error ? "border-red-400 ring-1 ring-red-300" : ""}`}
        step="any"
        aria-invalid={Boolean(error)}
      />
      <CellStatusDot status={cellStatus} />
      {error ? (
        <span className="mt-0.5 text-2xs font-semibold leading-tight text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
