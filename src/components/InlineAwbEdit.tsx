import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import { formatAwb, rawAwbDigits } from "../utils/awbFormat";
import { awbConflictMessage, findAwbDigitsConflict } from "../utils/awbUnique";
import { useToast } from "../ui";

interface Props {
  rowId: string;
  value: string;
  allRows: Shipment[];
  onCommit: (awbDisplay: string) => void;
  className?: string;
  onEnterNavigateDown?: () => void;
}

export function InlineAwbEdit({
  rowId,
  value,
  allRows,
  onCommit,
  className = "",
  onEnterNavigateDown,
}: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draftDigits, setDraftDigits] = useState(() => rawAwbDigits(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraftDigits(rawAwbDigits(value));
  }, [value, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    ref.current?.focus();
    ref.current?.select();
  }, [editing]);

  const gridProps = { "data-grid-row": rowId, "data-grid-field": "awb" };

  /** true = đã đóng ô và lưu (hoặc xóa AWB); false = cảnh báo, không lưu. */
  const tryCommit = (): boolean => {
    const d = draftDigits.replace(/\D/g, "");
    if (d.length === 0) {
      setEditing(false);
      const next = formatAwb("");
      if (next !== (value || "").trim()) onCommit(next);
      return true;
    }
    if (d.length !== 11) {
      toast.warning(
        d.length < 11
          ? `AWB phải đủ 11 chữ số (Air Waybill). Hiện bạn mới nhập ${d.length} số.`
          : `AWB chỉ được đúng 11 chữ số — bạn đã nhập ${d.length} số.`,
        "AWB chưa hợp lệ"
      );
      setEditing(false);
      return false;
    }
    const conflict = findAwbDigitsConflict(allRows, d, rowId);
    if (conflict) {
      toast.error(awbConflictMessage(conflict), "AWB trùng");
      setEditing(false);
      return false;
    }
    setEditing(false);
    const next = formatAwb(d);
    if (next !== (value || "").trim()) onCommit(next);
    return true;
  };

  const btnBase =
    "ops-inline-edit w-full rounded px-1 py-0.5 text-left font-mono text-sm font-semibold tracking-tight";

  if (!editing) {
    const shown =
      value && rawAwbDigits(value).length > 0 ? value : "Nhập AWB";
    return (
      <button
        type="button"
        {...gridProps}
        aria-label="Sửa AWB"
        title={
          value && rawAwbDigits(value).length > 0
            ? `AWB: ${value} — click để sửa`
            : "Click để nhập AWB"
        }
        onFocus={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={`${btnBase} hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${className} ${
          !value || rawAwbDigits(value).length === 0
            ? "ops-grid-placeholder"
            : "text-ui-awb"
        }`}
      >
        {shown}
      </button>
    );
  }

  /** Chỉ 0–11 chữ số khi đang gõ — không format gạch/khoảng trong input (tránh con trỏ nhảy / nhập lệch). */
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      spellCheck={false}
      {...gridProps}
      value={draftDigits}
      maxLength={11}
      onChange={(e) => {
        const raw = rawAwbDigits(e.target.value);
        if (raw.length > 11) {
          toast.info("AWB chỉ được 11 chữ số — chỉ giữ 11 số đầu.", "AWB");
        }
        setDraftDigits(raw.slice(0, 11));
      }}
      onBlur={() => {
        void tryCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
          e.preventDefault();
          if (tryCommit()) queueMicrotask(() => onEnterNavigateDown?.());
          return;
        }
        if (e.key === "Escape") {
          setDraftDigits(rawAwbDigits(value));
          setEditing(false);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={`w-full rounded-xl border-2 border-ui-primary bg-ui-surface px-1.5 py-0.5 font-shipment-data text-sm font-semibold tabular-nums tracking-tight text-ui-danger antialiased focus:outline-none focus:ring-2 focus:ring-ui-focus ${className}`}
    />
  );
}
