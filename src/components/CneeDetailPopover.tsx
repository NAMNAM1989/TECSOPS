import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SelectableTextWithCopyPopover } from "./SelectableTextWithCopyPopover";

type Props = {
  text: string;
  className?: string;
  panelLabel?: string;
  title?: string;
};

/**
 * Nút chi tiết CNEE — panel phẳng, copy bằng bôi đen (không magnify / blur).
 */
export function CneeDetailPopover({
  text,
  className = "",
  panelLabel = "Chi tiết lô & CNEE",
  title = "Xem chi tiết CNEE (bôi đen để sao chép)",
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 });
  const panelId = useId();

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(360, Math.max(280, window.innerWidth - 24));
    let left = r.left;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    let top = r.bottom + 6;
    const estH = 220;
    if (top + estH > window.innerHeight - 12) {
      top = Math.max(12, r.top - estH - 6);
    }
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ui-border bg-ui-surface text-[11px] font-bold text-ui-primary hover:bg-ui-surface-muted focus:outline-none focus:ring-2 focus:ring-ui-focus ${className}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        i
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={panelLabel}
              className="fixed z-[640] max-h-[min(50vh,22rem)] overflow-hidden rounded-lg border border-ui-border bg-ui-surface shadow-md"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="border-b border-ui-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
                {panelLabel}
              </div>
              <SelectableTextWithCopyPopover className="max-h-[min(44vh,18rem)] overflow-y-auto px-3 py-2">
                <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-ui-text">
                  {text}
                </pre>
              </SelectableTextWithCopyPopover>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
