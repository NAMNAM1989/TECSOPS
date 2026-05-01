import { useCallback, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry, CustomerPartyType } from "../types/customerDirectory";
import { lookupCustomerEntryByName } from "../utils/customerDirectoryCore";
import {
  buildCustomerCodeNameLine,
  buildCustomerPartyBlock,
  buildCustomerPartyTitle,
  buildCustomerQuickCopyBlock,
  customerPartiesByType,
  partyTypeLabel,
} from "../utils/customerDirectoryProfile";

type Props = {
  open: boolean;
  shipment: Shipment | null;
  directory: readonly CustomerDirectoryEntry[];
  onClose: () => void;
};

async function copyToClipboard(text: string): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    window.alert("Không sao chép được — thử chọn văn bản thủ công.");
    return false;
  }
}

function buildClipboardText(row: Shipment, directoryEntry: CustomerDirectoryEntry | undefined): string {
  const lines: string[] = [];
  lines.push("=== Theo danh sách khách hàng ===");
  if (directoryEntry) {
    lines.push(buildCustomerQuickCopyBlock(directoryEntry));
    lines.push("");
  } else if (row.customer.trim()) {
    lines.push("(Tên trên lô không khớp chính xác với tên trong danh bạ)");
    lines.push("");
  } else {
    lines.push("(Chưa có tên khách trên lô)");
    lines.push("");
  }
  lines.push("--- Lô hiện tại ---");
  lines.push(`AWB: ${row.awb}`);
  lines.push(`STT: ${row.stt} · ${row.flight}/${row.flightDate}`);
  lines.push(`Tên trên lô: ${row.customer || "—"}`);
  lines.push(`Mã trên lô: ${row.customerCode || "—"}`);
  return lines.join("\n");
}

export function CustomerShipmentDetailModal({ open, shipment, directory, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [quickKind, setQuickKind] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<CustomerPartyType | "ALL">("ALL");

  const directoryEntry = useMemo(
    () => (shipment ? lookupCustomerEntryByName(directory, shipment.customer) : undefined),
    [shipment, directory]
  );

  const text = useMemo(
    () => (shipment ? buildClipboardText(shipment, directoryEntry) : ""),
    [shipment, directoryEntry]
  );

  const copy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  const flashQuick = useCallback((kind: string) => {
    setQuickKind(kind);
    window.setTimeout(() => setQuickKind((k) => (k === kind ? null : k)), 1600);
  }, []);

  if (!open || !shipment) return null;

  const visibleParties = customerPartiesByType(directoryEntry, activeType);
  const partyTabs: Array<CustomerPartyType | "ALL"> = ["ALL", "SHIPPER", "CNEE", "NOTIFY", "OTHER"];

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
              Chi tiết khách (sao chép)
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
                  Theo danh sách khách hàng
                </p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(buildCustomerCodeNameLine(directoryEntry));
                      if (ok) flashQuick("cn");
                    }}
                    className="rounded-full border border-black/[0.1] bg-white px-3 py-1.5 text-[11px] font-semibold text-apple-label hover:bg-black/[0.04]"
                  >
                    {quickKind === "cn" ? "Đã chép · Mã+tên" : "Mã + tên"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(buildCustomerQuickCopyBlock(directoryEntry));
                      if (ok) flashQuick("full");
                    }}
                    className="rounded-full border border-apple-blue/30 bg-apple-blue/8 px-3 py-1.5 text-[11px] font-semibold text-apple-blue hover:bg-apple-blue/15"
                  >
                    {quickKind === "full" ? "Đã chép · Tất cả" : "Copy tất cả mẫu"}
                  </button>
                </div>
                <div className="rounded-2xl border border-black/[0.06] bg-apple-bg/50 px-3 py-2">
                  <p className="font-mono text-xs font-semibold text-apple-label">
                    {directoryEntry.code} · {directoryEntry.name}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {partyTabs.map((type) => {
                    const count = customerPartiesByType(directoryEntry, type).length;
                    const label = type === "ALL" ? "Tất cả" : partyTypeLabel(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setActiveType(type)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                          activeType === type
                            ? "border-apple-blue/40 bg-apple-blue/10 text-apple-blue"
                            : "border-black/[0.1] bg-white text-apple-secondary hover:bg-black/[0.03]"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
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
                          <button
                            type="button"
                            disabled={!party.content.trim()}
                            onClick={async () => {
                              const ok = await copyToClipboard(buildCustomerPartyBlock(party));
                              if (ok) flashQuick(party.id);
                            }}
                            className="ml-auto rounded-full bg-apple-blue px-3 py-1.5 text-[11px] font-semibold text-white disabled:bg-black/[0.12]"
                          >
                            {quickKind === party.id ? "Đã chép" : "Copy"}
                          </button>
                        </div>
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-apple-label">{party.content.trim() || "(Chưa nhập nội dung)"}</pre>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-black/[0.12] bg-white px-3 py-2 text-xs text-apple-tertiary">
                      Không có mẫu {activeType === "ALL" ? "copy" : partyTypeLabel(activeType)} cho khách này.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Tên trên lô không khớp chính xác với dòng nào trong «Danh sách khách hàng». Vẫn có thể sao chép phần «Lô hiện tại» bên dưới.
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

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-apple-secondary">Toàn bộ (một lần chép)</p>
            <textarea
              readOnly
              value={text}
              rows={16}
              className="w-full resize-y rounded-2xl border border-black/[0.08] bg-apple-bg px-3 py-2.5 font-mono text-xs leading-relaxed text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              onFocus={(e) => e.target.select()}
            />
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
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-full bg-apple-blue px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-apple-blue-hover active:scale-[0.98]"
          >
            {copied ? "Đã chép" : "Sao chép toàn bộ"}
          </button>
        </div>
      </div>
    </div>
  );
}
