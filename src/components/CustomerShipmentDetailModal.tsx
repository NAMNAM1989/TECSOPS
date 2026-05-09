import { useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry, CustomerPartyType } from "../types/customerDirectory";
import { lookupCustomerEntryByName } from "../utils/customerDirectoryCore";
import {
  buildCustomerPartyTitle,
  customerPartiesByType,
  partyTypeLabel,
} from "../utils/customerDirectoryProfile";

type Props = {
  open: boolean;
  shipment: Shipment | null;
  directory: readonly CustomerDirectoryEntry[];
  onClose: () => void;
};

export function CustomerShipmentDetailModal({ open, shipment, directory, onClose }: Props) {
  const activeType: CustomerPartyType | "ALL" = "ALL";

  const directoryEntry = useMemo(
    () => (shipment ? lookupCustomerEntryByName(directory, shipment.customer) : undefined),
    [shipment, directory]
  );

  if (!open || !shipment) return null;

  const visibleParties = customerPartiesByType(directoryEntry, activeType);

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
              Hồ sơ khách cho in phiếu cân
            </h2>
            <p className="mt-1 truncate text-xs text-apple-secondary">
              {shipment.awb} · #{shipment.stt} · {shipment.flight}/{shipment.flightDate}
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

        <div className="max-h-[min(62vh,560px)] space-y-4 overflow-y-auto px-5 py-4">
          {directoryEntry ? (
            <>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-apple-secondary">
                  Hồ sơ in ưu tiên (không copy/dán)
                </p>
                <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-apple-secondary">Tên in</dt>
                  <dd className="font-semibold text-apple-label">{directoryEntry.shipperName || directoryEntry.name || "—"}</dd>
                  <dt className="text-apple-secondary">Địa chỉ</dt>
                  <dd className="text-apple-label">{directoryEntry.shipperAddress || "—"}</dd>
                  <dt className="text-apple-secondary">SĐT</dt>
                  <dd className="font-mono text-apple-label">{directoryEntry.shipperPhone || "—"}</dd>
                  <dt className="text-apple-secondary">MST</dt>
                  <dd className="font-mono text-apple-label">{directoryEntry.taxCode || "—"}</dd>
                </dl>
                <div className="rounded-2xl border border-black/[0.06] bg-apple-bg/50 px-3 py-2">
                  <p className="font-mono text-xs font-semibold text-apple-label">
                    {directoryEntry.code} · {directoryEntry.name}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  {visibleParties.length > 0 ? (
                    visibleParties.map((party) => (
                      <div key={party.id} className="rounded-2xl border border-black/[0.08] bg-white p-2.5">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="rounded-md bg-apple-label px-2 py-1 font-mono text-[10px] font-bold text-white">
                            {partyTypeLabel(party.type)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-apple-label">
                            {buildCustomerPartyTitle(party)}
                          </span>
                        </div>
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-apple-label">{party.content.trim() || "(Chưa nhập nội dung)"}</pre>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-black/[0.12] bg-white px-3 py-2 text-xs text-apple-tertiary">
                      Không có dữ liệu phụ cho khách này.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Tên trên lô không khớp chính xác với dòng nào trong «Danh sách khách hàng».
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-apple-secondary">Trên lô</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-apple-secondary">Tên</dt>
              <dd className="font-semibold text-apple-label">{shipment.customer || "—"}</dd>
              <dt className="text-apple-secondary">Mã đã lưu</dt>
              <dd className="font-mono text-apple-label">{shipment.customerCode || "—"}</dd>
            </dl>
          </div>

        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/[0.06] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-apple-secondary hover:bg-black/[0.05]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
