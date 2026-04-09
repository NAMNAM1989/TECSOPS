import { useEffect, useRef, useState } from "react";

interface Props {
  value: number | null;
  placeholder?: string;
  onCommit: (v: number | null) => void;
  className?: string;
  /** Thu gọn cho hàng mobile 1–2 dòng */
  compact?: boolean;
}

export function InlineNumberEdit({
  value,
  placeholder = "—",
  onCommit,
  className = "",
  compact = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== null ? String(value) : "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value !== null ? String(value) : "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
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

  const btnBase = compact
    ? "inline-flex min-w-[2rem] max-w-[4rem] justify-end rounded px-0.5 py-0 text-[11px] leading-none font-bold tabular-nums"
    : "w-full rounded px-1 py-0.5 text-right";

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={`${btnBase} hover:bg-black/[0.04] ${className} ${
          value === null ? "italic text-apple-tertiary" : ""
        }`}
      >
        {value !== null ? value.toLocaleString() : placeholder}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value !== null ? String(value) : "");
          setEditing(false);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={
        compact
          ? "inline-block w-14 rounded-lg border border-apple-blue bg-white px-1 py-0.5 text-right text-[11px] font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/25"
          : "w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 text-right text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
      }
      step="any"
    />
  );
}
