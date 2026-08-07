import { useLayoutEffect, useRef, useState } from "react";

type Props = {
  rowId: string;
  value: string;
  onCommit: (v: string) => void;
};

/**
 * Ghi chú gọn trên hàng Ops — icon + chỉnh 1 dòng (không chiếm cột STATUS).
 */
export function OpsRowNoteControl({ rowId, value, onCommit }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasNote = Boolean(value.trim());

  useLayoutEffect(() => {
    if (!open) return;
    setDraft(value);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, value]);

  const commit = () => {
    const next = draft.trim();
    setOpen(false);
    if (next !== value.trim()) onCommit(next);
  };

  return (
    <div
      className="relative shrink-0"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-grid-row={rowId}
        data-grid-field="note"
        title={hasNote ? value : "Thêm ghi chú"}
        aria-label={hasNote ? `Ghi chú: ${value}` : "Thêm ghi chú"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[12px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
          hasNote
            ? "border-red-300/80 bg-red-50 text-red-800 hover:bg-red-100"
            : "border-ui-border bg-ui-surface text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
        }`}
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 3.5a2.121 2.121 0 013 3L12 16l-4 1 1-4 9.5-9.5z"
          />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-ui-border bg-ui-surface p-2 shadow-lg">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
            Ghi chú
          </label>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={2000}
            placeholder="Nhập ghi chú…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft(value);
                setOpen(false);
              }
            }}
            className="w-full rounded-lg border border-ui-border bg-white px-2 py-1.5 text-[11px] font-semibold text-ui-text outline-none focus:ring-2 focus:ring-ui-focus"
          />
        </div>
      ) : null}
    </div>
  );
}
