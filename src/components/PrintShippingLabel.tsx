import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";
import type { Shipment } from "../types/shipment";
import { statusLabel } from "./statusStyles";

const qrPayload = (s: Shipment) =>
  JSON.stringify({
    awb: s.awb,
    flight: s.flight,
    dest: s.dest,
    warehouse: s.warehouse,
    pcs: s.pcs,
    kg: s.kg,
    customer: s.customer,
  });

export function LabelContent({ s }: { s: Shipment }) {
  const barcodeValue = s.awb.replace(/\D/g, "").slice(0, 13) || "0000000000";

  return (
    <div className="print-label-sheet flex flex-col border-[3px] border-black bg-white p-3 text-black">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b-2 border-black pb-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-600">
            AIR CARGO LABEL
          </p>
          <p className="font-mono text-xl font-black leading-tight tracking-tight">{s.awb}</p>
        </div>
        <div className="shrink-0 rounded border-2 border-black bg-white p-0.5">
          <QRCodeSVG value={qrPayload(s)} size={56} level="M" marginSize={0} />
        </div>
      </div>

      {/* Main info */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <LabelField label="CHUYẾN BAY" className="font-mono text-sm font-bold">
          {s.flight}/{s.flightDate}
        </LabelField>
        <LabelField label="DEST" className="text-2xl font-black leading-none">
          {s.dest}
        </LabelField>
        <LabelField label="KHO" className="text-sm font-bold">
          {s.warehouse}
        </LabelField>
        <LabelField label="KIỆN / KG" className="font-mono text-sm font-bold">
          {s.pcs ?? "—"} / {s.kg ?? "—"}
        </LabelField>
      </div>

      {/* Customer & status */}
      <div className="mt-2 min-h-0 flex-1 border-t-2 border-black pt-2">
        <LabelField label="KHÁCH HÀNG" className="line-clamp-2 text-base font-extrabold leading-snug">
          {s.customer}
        </LabelField>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block rounded border border-black px-2 py-0.5 text-[10px] font-bold">
            {statusLabel[s.status]}
          </span>
          {s.cutoffNote && (
            <span className="rounded bg-black px-2 py-0.5 text-[10px] font-bold text-white">
              {s.cutoffNote}
            </span>
          )}
        </div>
      </div>

      {/* Barcode footer */}
      <div className="mt-auto flex flex-col items-center border-t-2 border-dashed border-black pt-2">
        <div className="w-full overflow-hidden [&_svg]:max-h-[32mm] [&_svg]:w-full">
          <Barcode
            value={barcodeValue}
            format="CODE128"
            width={1.4}
            height={40}
            displayValue
            fontSize={11}
            margin={0}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>
        {s.cutoff && (
          <p className="mt-1 font-mono text-[9px] font-semibold">
            Cutoff: {new Date(s.cutoff).toLocaleString("vi-VN")}
          </p>
        )}
      </div>
    </div>
  );
}

function LabelField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <p className={className}>{children}</p>
    </div>
  );
}

interface PrintShippingLabelProps {
  shipment: Shipment;
  onClose: () => void;
}

export function PrintShippingLabel({ shipment, onClose }: PrintShippingLabelProps) {
  return (
    <>
      {/* Modal xem trước (ẩn khi in) */}
      <div
        className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div className="no-print w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">In nhãn</h2>
              <p className="text-xs text-slate-500">
                {shipment.awb} · {shipment.customer}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Đóng"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mx-auto flex justify-center overflow-auto rounded-lg bg-slate-100 p-4">
            <div
              className="origin-top scale-[0.68] shadow-lg sm:scale-[0.82]"
              style={{ width: "100mm", height: "150mm" }}
            >
              <LabelContent s={shipment} />
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-slate-500">100mm × 150mm</p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                requestAnimationFrame(() => window.print());
              }}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white hover:bg-slate-800 active:scale-[0.98]"
            >
              In ngay
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {/* Bản in — chỉ hiện khi in */}
      <div
        className="print-only fixed left-0 top-0 hidden h-screen w-screen items-center justify-center bg-white print:flex"
        aria-hidden
      >
        <LabelContent s={shipment} />
      </div>
    </>
  );
}
