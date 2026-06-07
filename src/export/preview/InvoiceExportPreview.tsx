import { memo, type ReactNode } from "react";
import type { InvoiceExportPayload } from "../contracts/invoiceExportPayload";
import { A4_HEIGHT_MM, A4_WIDTH_MM } from "../../utils/printMmUnits";
import { InvoiceA4Document } from "./InvoiceA4Document";
import { useA4PreviewScale } from "./useA4PreviewScale";

type Props = {
  exportPayload: InvoiceExportPayload;
};

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-black/[0.06] hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
    >
      {children}
    </button>
  );
}

/** Xem trước đúng khổ A4 thật (210×297 mm) — mặc định 100%, cuộn nếu cần. */
export const InvoiceExportPreview = memo(function InvoiceExportPreview({ exportPayload: p }: Props) {
  const {
    viewportRef,
    pageRef,
    scale,
    isActualSize,
    scaledW,
    scaledH,
    zoomPercent,
    mode,
    setActualSize,
    setFitToPanel,
    zoomIn,
    zoomOut,
  } = useA4PreviewScale(
    `${p.meta.invoiceNo}|${p.lines.length}|${p.totals.totalAmountUsd}|${p.totals.totalGrossKg}`
  );

  const seq =
    p.meta.totalDeclarations > 1
      ? ` · Tờ ${p.meta.declarationSeq}/${p.meta.totalDeclarations}`
      : "";

  const pageNode = (
    <InvoiceA4Document ref={pageRef} payload={p} className="shadow-[0_2px_12px_rgba(0,0,0,0.12)] ring-1 ring-black/10" />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/[0.08] bg-white/90 px-3 py-2 dark:border-white/[0.08] dark:bg-ops-surface/95">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            Xem trước A4
            <span className="ml-1.5 font-mono font-medium text-indigo-700 dark:text-indigo-300">
              {p.meta.invoiceNo}
            </span>
            {seq ? <span className="font-normal text-slate-500 dark:text-slate-400">{seq}</span> : null}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {isActualSize
              ? `Cỡ in thật · ${A4_WIDTH_MM}×${A4_HEIGHT_MM} mm · cuộn để xem toàn trang`
              : `${zoomPercent}% · ${A4_WIDTH_MM}×${A4_HEIGHT_MM} mm`}
          </p>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-black/[0.08] bg-black/[0.03] p-0.5 dark:border-white/10 dark:bg-black/30">
          <IconBtn onClick={zoomOut} title="Thu nhỏ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14" />
            </svg>
          </IconBtn>
          <span className="min-w-[2.75rem] select-none text-center text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
            {zoomPercent}%
          </span>
          <IconBtn onClick={zoomIn} title="Phóng to">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </IconBtn>
        </div>

        <div className="flex rounded-lg border border-black/[0.08] bg-black/[0.03] p-0.5 dark:border-white/10 dark:bg-black/30">
          <button
            type="button"
            onClick={setActualSize}
            title="210×297 mm — cùng cỡ khi in"
            className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
              mode === "actual"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.06]"
            }`}
          >
            A4 thật
          </button>
          <button
            type="button"
            onClick={setFitToPanel}
            title="Thu nhỏ vừa khung xem"
            className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
              mode === "fit"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.06]"
            }`}
          >
            Vừa khung
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto bg-neutral-400 dark:bg-neutral-700"
      >
        <div className="inline-flex min-h-full min-w-full justify-center p-5">
          {isActualSize ? (
            <div className="shrink-0 self-start">{pageNode}</div>
          ) : (
            <div className="relative shrink-0 self-start" style={{ width: scaledW, height: scaledH }}>
              <div
                className="origin-top-left"
                style={{
                  width: `${A4_WIDTH_MM}mm`,
                  transform: `scale(${scale})`,
                }}
              >
                {pageNode}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
