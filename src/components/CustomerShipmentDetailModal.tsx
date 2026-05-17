import { useCallback, useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { buildShipmentCneeCopyBlock } from "../utils/shipmentCneeCopyBlock";

type Props = {
  open: boolean;
  shipment: Shipment | null;
  directory: readonly CustomerDirectoryEntry[];
  /** Ngày phiên OPS (YYYY-MM-DD) — dự phòng khi `sessionDate` trên lô trống. */
  viewSessionYmd?: string;
  onClose: () => void;
};

export function CustomerShipmentDetailModal({
  open,
  shipment,
  directory,
  viewSessionYmd = "",
  onClose,
}: Props) {
  const copyText = useMemo(
    () =>
      shipment
        ? buildShipmentCneeCopyBlock(shipment, directory, { sessionYmdFallback: viewSessionYmd })
        : "",
    [directory, shipment, viewSessionYmd]
  );

  const copyToClipboard = useCallback(async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      onClose();
    } catch {
      window.alert("Không sao chép được — bôi đen nội dung bên trên và Ctrl+C.");
    }
  }, [copyText, onClose]);

  if (!open || !shipment) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/25 p-3 backdrop-blur-xl sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-shipment-detail-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-hidden rounded-[28px] border border-black/[0.08] bg-white shadow-apple-md">
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 id="customer-shipment-detail-title" className="text-[19px] font-semibold tracking-tight text-apple-label">
              Thông tin CNEE
            </h2>
            <p className="mt-1 truncate text-xs text-apple-secondary">
              {shipment.awb} · #{shipment.stt} · {shipment.customer || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-apple-secondary hover:bg-black/[0.05]"
            aria-label="Đóng"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[min(62vh,560px)] overflow-y-auto px-5 py-4">
          <p className="mb-2 text-xs text-apple-secondary">
            Bôi đen và Ctrl+C để sao chép. Nội dung theo lô hiện tại:
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-2xl border border-black/[0.08] bg-apple-bg/60 px-3 py-3 font-mono text-xs leading-relaxed text-apple-label">
            {copyText || "(Chưa có thông tin CNEE)"}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/[0.06] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-apple-secondary hover:bg-black/[0.05]"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={() => void copyToClipboard()}
            className="rounded-full bg-apple-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Sao chép
          </button>
        </div>
      </div>
    </div>
  );
}
