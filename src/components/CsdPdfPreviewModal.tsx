import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CsdTemplateResolve } from "../types/csdTemplate";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  pdfUrl: string;
  meta: CsdTemplateResolve | null;
  awb?: string;
  onClose: () => void;
};

export function CsdPdfPreviewModal({ pdfUrl, meta, awb, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const printPdf = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      alert("Chưa tải xong PDF.");
      return;
    }
    win.focus();
    win.print();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex flex-col bg-black/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Xem trước CSD"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-4xl flex-col px-2 py-3 sm:px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex shrink-0 flex-wrap items-center gap-2 rounded-t-xl border px-3 py-2 ${OPS.modal} ${OPS.border}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-apple-label">Xem trước CSD (A4)</p>
            <p className="truncate text-[11px] text-apple-secondary">
              {awb ? `AWB ${awb}` : "—"}
              {meta?.templateName ? ` · ${meta.templateName}` : ""}
              {meta?.renderMode ? ` · ${meta.renderMode}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={printPdf}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
          >
            In
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${OPS.tabIdle}`}
          >
            Đóng
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-hidden rounded-b-xl border border-t-0 bg-zinc-200/80 ${OPS.border}`}>
          <iframe
            ref={iframeRef}
            src={pdfUrl}
            title="Xem trước CSD"
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
