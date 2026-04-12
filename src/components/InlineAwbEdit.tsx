import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import { formatAwb, rawAwbDigits } from "../utils/awbFormat";
import { isAwbDigitsTaken } from "../utils/awbUnique";

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
      window.alert(
        d.length < 11
          ? `AWB phải đủ 11 chữ số (Air Waybill). Hiện bạn mới nhập ${d.length} số.`
          : `AWB chỉ được đúng 11 chữ số — bạn đã nhập ${d.length} số.`
      );
      setEditing(false);
      return false;
    }
    if (isAwbDigitsTaken(allRows, d, rowId)) {
      window.alert("AWB đã tồn tại — mỗi số AWB chỉ dùng một lần.");
      setEditing(false);
      return false;
    }
    setEditing(false);
    const next = formatAwb(d);
    if (next !== (value || "").trim()) onCommit(next);
    return true;
  };

  const btnBase = "w-full rounded px-1 py-0.5 text-left font-mono text-sm font-semibold tracking-tight";

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
          !value || rawAwbDigits(value).length === 0 ? "italic text-apple-tertiary" : "text-apple-label"
        }`}
      >
        {value && rawAwbDigits(value).length > 0 ? value : "Nhập AWB"}
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
          window.alert("AWB chỉ được 11 chữ số — chỉ giữ 11 số đầu.");
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
      className={`w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 font-mono text-sm font-semibold tabular-nums tracking-tight antialiased focus:outline-none focus:ring-2 focus:ring-apple-blue/20 ${className}`}
    />
  );
}
