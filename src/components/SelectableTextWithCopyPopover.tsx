import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PopoverState = {
  x: number;
  y: number;
  text: string;
};

type Props = {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
};

/** Vùng chữ bôi đen → nút « Sao chép » nổi gần vùng chọn (giống mobile / Docs). */
export function SelectableTextWithCopyPopover({
  children,
  className = "",
  title,
  onMouseDown,
  onClick,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [copied, setCopied] = useState(false);

  const syncFromSelection = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      setPopover(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setPopover(null);
      setCopied(false);
      return;
    }
    const text = sel.toString();
    if (!text.trim()) {
      setPopover(null);
      setCopied(false);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setPopover(null);
      setCopied(false);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPopover(null);
      return;
    }
    setCopied(false);
    setPopover({
      x: rect.left + rect.width / 2,
      y: Math.max(8, rect.top - 6),
      text,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", syncFromSelection);
    const hide = () => setPopover(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("selectionchange", syncFromSelection);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [syncFromSelection]);

  const handleCopy = useCallback(async () => {
    if (!popover?.text) return;
    try {
      await navigator.clipboard.writeText(popover.text);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        setPopover(null);
        window.getSelection()?.removeAllRanges();
      }, 700);
    } catch {
      /* ignore */
    }
  }, [popover?.text]);

  return (
    <>
      <div
        ref={rootRef}
        className={className}
        title={title}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        {children}
      </div>
      {popover && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              style={{
                position: "fixed",
                left: popover.x,
                top: popover.y,
                transform: "translate(-50%, -100%)",
                zIndex: 600,
              }}
              className="select-none rounded-md border border-black/10 bg-apple-label px-2 py-0.5 text-[10px] font-semibold text-white shadow-apple active:scale-95"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopy();
              }}
            >
              {copied ? "Đã copy" : "Sao chép"}
            </button>,
            document.body
          )
        : null}
    </>
  );
}
