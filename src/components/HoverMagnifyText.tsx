import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeCneeMagnifyPanelPos, type CneeMagnifyPanelPos } from "../utils/cneeMagnifyPanelPosition";
import { SelectableTextWithCopyPopover } from "./SelectableTextWithCopyPopover";

const CLOSE_DELAY_MS = 220;
const MAGNIFY_FONT_CLASS = "text-[15px] leading-[1.65] tracking-[0.01em]";
const META_LINE_RE = /^(AWB|Ngày bay|Chuyến bay|Dest):/;

function MagnifyPanelBody({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className={`space-y-0.5 ${MAGNIFY_FONT_CLASS}`}>
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={`sp-${idx}`} className="h-2" aria-hidden />;
        }
        if (line === "CNEE:") {
          return (
            <p
              key={`cnee-${idx}`}
              className="pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300"
            >
              {line}
            </p>
          );
        }
        if (META_LINE_RE.test(line)) {
          const colon = line.indexOf(":");
          const label = line.slice(0, colon + 1);
          const value = line.slice(colon + 1).trim();
          return (
            <p key={`meta-${idx}`} className="leading-snug">
              <span className="font-semibold text-apple-secondary dark:text-zinc-400">{label}</span>{" "}
              <span className="font-semibold text-apple-label dark:text-zinc-50">{value}</span>
            </p>
          );
        }
        return (
          <p key={`body-${idx}`} className="font-medium leading-relaxed text-apple-label dark:text-zinc-100">
            {line}
          </p>
        );
      })}
    </div>
  );
}

type Props = {
  text: string;
  /** Nhãn gọn trong ô lưới; panel vẫn hiển thị `text` đầy đủ. */
  displayText?: string;
  /** Chỉ hiện icon ℹ thay vì chữ (tooltip khi hover). */
  iconOnly?: boolean;
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
  iconOnly = false,
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
    if (typeof document !== "undefined" && document.body.dataset.invoiceModalOpen === "1") {
      return;
    }
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
  const showIconTrigger = iconOnly || (!displayText?.trim() && text.trim());

  return (
    <>
      <div
        ref={anchorRef}
        className={`relative min-w-0 rounded-md transition-[box-shadow,background-color,opacity] duration-200 ${
          open
            ? "z-[2] opacity-0"
            : "opacity-100 hover:z-[1] hover:bg-apple-blue/[0.04] hover:shadow-[0_0_0_1px_rgba(0,122,255,0.2)] dark:hover:bg-apple-blue/10"
        }`}
        onMouseEnter={openMagnify}
        onMouseLeave={scheduleClose}
        onClick={(e) => {
          onClick?.(e);
          openMagnify();
        }}
      >
        {showIconTrigger && !displayText?.trim() ? (
          <button
            type="button"
            title={magnifyTitle}
            aria-label={magnifyTitle}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sky-300/55 bg-sky-50/90 text-sky-800 hover:bg-sky-100 dark:border-sky-400/40 dark:bg-sky-950/60 dark:text-sky-200 dark:hover:bg-sky-900/70"
            onMouseDown={onMouseDown}
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        ) : (
          <SelectableTextWithCopyPopover
            className={`flex min-w-0 items-center gap-1 ${className}`}
            title={magnifyTitle}
            onMouseDown={onMouseDown}
          >
            <span className="min-w-0 flex-1 truncate">{inlineLabel}</span>
            {showInfoHint ? (
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sky-300/50 bg-sky-50 text-sky-700 dark:border-sky-400/45 dark:bg-sky-950/70 dark:text-sky-200"
                aria-hidden
                title="Chi tiết CNEE"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            ) : null}
          </SelectableTextWithCopyPopover>
        )}
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="pointer-events-none fixed inset-0 z-[638] bg-[#1c1c1e]/8 backdrop-blur-[1px] animate-cnee-magnify-backdrop motion-reduce:animate-none motion-reduce:opacity-100 dark:bg-black/35"
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
                className={`animate-cnee-magnify-panel motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:filter-none flex max-h-[inherit] flex-col overflow-hidden rounded-xl border border-sky-300/70 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18),0_0_0_2px_rgba(0,122,255,0.25)] ring-1 ring-sky-200/80 dark:border-sky-500/35 dark:bg-ops-elevated dark:text-zinc-100 dark:shadow-[0_16px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(56,189,248,0.25)] dark:ring-sky-700/40 ${
                  panelPos.placement === "below" ? "origin-top" : "origin-top-left"
                }`}
                onMouseEnter={keepOpen}
                onMouseLeave={scheduleClose}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-gradient-to-b from-[#f8f9fc] to-white px-3.5 py-2 dark:border-white/10 dark:from-ops-surface dark:to-ops-elevated">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-apple-secondary dark:text-sky-300/90">
                    {panelLabel}
                  </span>
                  <span
                    className={`text-[10px] font-medium transition-colors ${
                      rightClickCopied
                        ? "font-semibold text-emerald-700 dark:text-emerald-400"
                        : "text-apple-tertiary dark:text-zinc-400"
                    }`}
                  >
                    {rightClickCopied
                      ? "Đã copy"
                      : "Bôi đen · chuột phải = copy · Ctrl+C"}
                  </span>
                </div>
                <div
                  ref={panelTextRef}
                  className="min-h-0 flex-1 overflow-y-auto bg-white px-3.5 py-3 dark:bg-ops-elevated"
                  onContextMenu={handlePanelContextMenu}
                >
                  <SelectableTextWithCopyPopover
                    className="cursor-text select-text"
                    title="Bôi đen chữ → chuột phải để copy (hoặc Ctrl+C)"
                  >
                    <MagnifyPanelBody text={text} />
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
