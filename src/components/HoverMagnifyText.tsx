import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeCneeMagnifyPanelPos, type CneeMagnifyPanelPos } from "../utils/cneeMagnifyPanelPosition";
import { SelectableTextWithCopyPopover } from "./SelectableTextWithCopyPopover";

const CLOSE_DELAY_MS = 220;
const MAGNIFY_FONT_CLASS = "text-[15px] leading-[1.65] tracking-[0.01em]";

type Props = {
  text: string;
  /** Nhãn gọn trong ô lưới; panel vẫn hiển thị `text` đầy đủ. */
  displayText?: string;
  className?: string;
  magnifyTitle?: string;
  panelLabel?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
};

/** Chữ nhỏ trong ô bảng; rê chuột / click → panel fixed bám ngay dưới ô (portal body). */
export function HoverMagnifyText({
  text,
  displayText,
  className = "",
  magnifyTitle = "Rê chuột hoặc bấm để xem chi tiết ngay dưới ô — bôi đen chữ để sao chép",
  panelLabel = "CNEE",
  onMouseDown,
  onClick,
}: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelTextRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [rightClickCopied, setRightClickCopied] = useState(false);
  const [panelPos, setPanelPos] = useState<CneeMagnifyPanelPos>({
    top: 0,
    left: 0,
    width: 360,
    maxHeight: 400,
    placement: "below",
  });

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelScheduledClose]);

  const syncPanelToAnchor = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPanelPos(computeCneeMagnifyPanelPos(el.getBoundingClientRect()));
  }, []);

  const openMagnify = useCallback(() => {
    cancelScheduledClose();
    syncPanelToAnchor();
    setOpen(true);
  }, [cancelScheduledClose, syncPanelToAnchor]);

  const keepOpen = useCallback(() => {
    cancelScheduledClose();
  }, [cancelScheduledClose]);

  const handlePanelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const root = panelTextRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed) return;
    const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (!range || !root.contains(range.commonAncestorContainer)) return;
    const selected = sel.toString();
    if (!selected.trim()) return;
    void navigator.clipboard.writeText(selected).then(() => {
      setRightClickCopied(true);
      if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
      copyHintTimerRef.current = setTimeout(() => setRightClickCopied(false), 1400);
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncPanelToAnchor();
    const onReposition = () => syncPanelToAnchor();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);

    const el = anchorRef.current;
    let ro: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onReposition);
      ro.observe(el);
    }

    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      ro?.disconnect();
    };
  }, [open, text, syncPanelToAnchor]);

  useLayoutEffect(
    () => () => {
      cancelScheduledClose();
      if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
    },
    [cancelScheduledClose]
  );

  if (!text.trim()) return null;

  const inlineLabel = (displayText ?? text).trim() || text.trim();
  const showInfoHint = Boolean(displayText && displayText.trim() !== text.trim());

  return (
    <>
      <div
        ref={anchorRef}
        className={`relative min-w-0 rounded-md transition-[box-shadow,background-color,opacity] duration-200 ${
          open
            ? "z-[2] opacity-0"
            : "opacity-100 hover:z-[1] hover:bg-apple-blue/[0.04] hover:shadow-[0_0_0_1px_rgba(0,122,255,0.2)]"
        }`}
        onMouseEnter={openMagnify}
        onMouseLeave={scheduleClose}
        onClick={(e) => {
          onClick?.(e);
          openMagnify();
        }}
      >
        <SelectableTextWithCopyPopover
          className={`flex min-w-0 items-center gap-1 ${className}`}
          title={magnifyTitle}
          onMouseDown={onMouseDown}
        >
          <span className="min-w-0 flex-1 truncate">{inlineLabel}</span>
          {showInfoHint ? (
            <span
              className="shrink-0 text-[10px] leading-none text-apple-tertiary"
              aria-hidden
              title="Chi tiết CNEE"
            >
              ℹ
            </span>
          ) : null}
        </SelectableTextWithCopyPopover>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="pointer-events-none fixed inset-0 z-[638] bg-[#1c1c1e]/8 backdrop-blur-[1px] animate-cnee-magnify-backdrop motion-reduce:animate-none motion-reduce:opacity-100"
                aria-hidden
              />
              <div
                role="dialog"
                aria-label={`${panelLabel} phóng to`}
                style={{
                  position: "fixed",
                  top: panelPos.top,
                  left: panelPos.left,
                  width: panelPos.width,
                  maxHeight: panelPos.maxHeight,
                  zIndex: 650,
                }}
                className={`animate-cnee-magnify-panel motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:filter-none flex max-h-[inherit] flex-col overflow-hidden rounded-xl border border-sky-300/70 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18),0_0_0_2px_rgba(0,122,255,0.25)] ring-1 ring-sky-200/80 ${
                  panelPos.placement === "below" ? "origin-top" : "origin-top-left"
                }`}
                onMouseEnter={keepOpen}
                onMouseLeave={scheduleClose}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-gradient-to-b from-[#f8f9fc] to-white px-3.5 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-apple-secondary">
                    {panelLabel}
                  </span>
                  <span
                    className={`text-[10px] font-medium transition-colors ${
                      rightClickCopied ? "font-semibold text-emerald-700" : "text-apple-tertiary"
                    }`}
                  >
                    {rightClickCopied
                      ? "Đã copy"
                      : "Bôi đen · chuột phải = copy · Ctrl+C"}
                  </span>
                </div>
                <div
                  ref={panelTextRef}
                  className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3"
                  onContextMenu={handlePanelContextMenu}
                >
                  <SelectableTextWithCopyPopover
                    className={`cursor-text select-text whitespace-pre-wrap break-words font-medium text-apple-label ${MAGNIFY_FONT_CLASS}`}
                    title="Bôi đen chữ → chuột phải để copy (hoặc Ctrl+C)"
                  >
                    {text}
                  </SelectableTextWithCopyPopover>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </>
  );
}
