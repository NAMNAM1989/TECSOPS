import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  buildShipmentCustomerDetailSections,
  CUSTOMER_DETAIL_EMPTY,
  type CustomerDetailPartyBlock,
  type ShipmentCustomerDetailSections,
} from "../utils/shipmentCneeCopyBlock";
import { SelectableTextWithCopyPopover } from "./SelectableTextWithCopyPopover";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  sessionYmdFallback?: string;
  className?: string;
  panelLabel?: string;
  title?: string;
};

/** Chấm than trong vòng tròn — gọn, dễ nhận trên lưới Ops. */
function IconAlertMark({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "scale-105" : ""}`}
    >
      <circle
        cx="10"
        cy="10"
        r="8.25"
        className={open ? "fill-amber-500" : "fill-sky-500"}
      />
      <path
        d="M10 5.6c-.42 0-.76.34-.76.76v4.55c0 .42.34.76.76.76s.76-.34.76-.76V6.36c0-.42-.34-.76-.76-.76Z"
        className="fill-white"
      />
      <circle cx="10" cy="14.15" r="0.95" className="fill-white" />
    </svg>
  );
}

function DetailSection({
  label,
  lines,
  empty,
}: {
  label: string;
  lines: string[];
  empty: boolean;
}) {
  return (
    <section className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </h4>
      <div
        className={`whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed ${
          empty ? "italic text-slate-400" : "text-slate-800"
        }`}
      >
        {lines.join("\n")}
      </div>
    </section>
  );
}

/** Shipper / CNEE: tên tách khỏi địa chỉ (không dồn một khối). */
function PartyDetailSection({
  label,
  party,
}: {
  label: string;
  party: CustomerDetailPartyBlock;
}) {
  if (party.empty) {
    return (
      <DetailSection label={label} lines={[CUSTOMER_DETAIL_EMPTY]} empty />
    );
  }
  return (
    <section className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </h4>
      <div className="space-y-2.5">
        {party.name ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Tên
            </p>
            <p className="break-words font-sans text-[14px] font-semibold leading-snug text-slate-900">
              {party.name}
            </p>
          </div>
        ) : null}
        {party.addressLines.length ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Địa chỉ
            </p>
            <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-700">
              {party.addressLines.join("\n")}
            </p>
          </div>
        ) : null}
        {party.contactLines.length ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Liên hệ
            </p>
            <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-700">
              {party.contactLines.join("\n")}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Nút xem chi tiết khách — panel Shipper / CNEE / Tên hàng + sao chép tất cả.
 */
export function CneeDetailPopover({
  shipment,
  customerDirectory,
  sessionYmdFallback,
  className = "",
  panelLabel = "Thông tin khách & CNEE",
  title = "Xem thông tin khách / CNEE (bôi đen để sao chép)",
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 520 });
  const [copied, setCopied] = useState(false);
  const panelId = useId();

  const detail: ShipmentCustomerDetailSections = buildShipmentCustomerDetailSections(
    shipment,
    customerDirectory,
    { sessionYmdFallback },
  );

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Bảng thông tin cần rộng để đọc địa chỉ / liên hệ rõ.
    const width = Math.min(560, Math.max(440, window.innerWidth - 32));
    let left = r.right - width;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    const estH = Math.min(window.innerHeight * 0.82, 640);
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - 12) {
      top = Math.max(12, r.top - estH - 6);
    }
    if (top < 12) top = 12;
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    setCopied(false);
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

  if (!detail.hasContent) return null;

  const onCopyAll = () => {
    void copyText(detail.copyAllText).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`group inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 shadow-sm ring-1 ring-sky-200/80 transition hover:bg-sky-100 hover:ring-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
          open ? "bg-sky-100 ring-sky-400" : ""
        } ${className}`}
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
        <IconAlertMark open={open} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={panelLabel}
              className="fixed z-[640] max-h-[min(85vh,40rem)] overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/15"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-slate-900">
                      {detail.customerName || "—"}
                    </p>
                    {detail.metaSummary ? (
                      <p className="mt-1 text-[12px] leading-snug text-slate-500">
                        {detail.metaSummary}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyAll();
                    }}
                  >
                    {copied ? "Đã chép" : "Sao chép tất cả"}
                  </button>
                </div>
              </div>
              <SelectableTextWithCopyPopover className="max-h-[min(72vh,34rem)] space-y-3 overflow-y-auto px-4 py-3.5">
                <PartyDetailSection label="Shipper" party={detail.shipper} />
                <PartyDetailSection label="CNEE" party={detail.cnee} />
                <DetailSection
                  label="Tên hàng"
                  lines={detail.goodsLines}
                  empty={detail.goodsEmpty}
                />
              </SelectableTextWithCopyPopover>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
