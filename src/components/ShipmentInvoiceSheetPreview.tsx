import { memo, useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  invoiceLineAmountUsd,
  invoiceLineGrossWeightKg,
  roundDeclarationKg,
  totalsForInvoice,
  type InvoiceLineItem,
} from "../types/invoiceItem";
import { buildShipmentCneeBodyLines } from "../utils/shipmentCneeCopyBlock";
import {
  buildInvoiceNumber,
  formatInvoiceFlightLine,
  formatInvoiceSheetDate,
} from "../utils/shipmentInvoiceCore";

const SHIPPER_LINES = [
  "THE SHIPPER:",
  "CÔNG TY TNHH NAM NAM LOGISTICS",
  "11 NGUYỄN TRỌNG LỘI, PHƯỜNG TÂN SƠN NHẤT",
  "THÀNH PHỐ HỒ CHÍ MINH",
] as const;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  items: InvoiceLineItem[];
  invoiceNo?: string;
  footerPcs?: number | null;
  footerKg?: number | null;
};

export const ShipmentInvoiceSheetPreview = memo(function ShipmentInvoiceSheetPreview({
  shipment,
  customerDirectory,
  items,
  invoiceNo: invoiceNoProp,
  footerPcs,
  footerKg,
}: Props) {
  const at = useMemo(() => new Date(), []);
  const invoiceNo = useMemo(
    () => invoiceNoProp ?? buildInvoiceNumber(shipment, customerDirectory, at),
    [invoiceNoProp, shipment, customerDirectory, at]
  );
  const dateStr = formatInvoiceSheetDate(at);
  const flightLine = formatInvoiceFlightLine(shipment);
  const cneeLines = useMemo(
    () => buildShipmentCneeBodyLines(shipment, customerDirectory, { omitEmail: true }),
    [shipment, customerDirectory]
  );
  const totals = useMemo(() => totalsForInvoice(items), [items]);

  const cartonFooter =
    (footerPcs ?? shipment.pcs) != null && (footerPcs ?? shipment.pcs)! > 0
      ? `${footerPcs ?? shipment.pcs} CTNS`
      : "—";
  const kgFooter =
    (footerKg ?? shipment.kg) != null && (footerKg ?? shipment.kg)! > 0
      ? `${roundDeclarationKg(footerKg ?? shipment.kg)} KGM`
      : totals.totalGrossKg > 0
        ? `${totals.totalGrossKg} KGM`
        : "—";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-2 shrink-0 text-center text-[11px] font-medium text-slate-600 dark:text-slate-400">
        Xem trước Invoice (kèm tờ khai HQ) · A4 · Times New Roman
      </p>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-200/80 p-3 dark:bg-slate-900/80">
        <article
          className="mx-auto w-full max-w-[52rem] bg-white px-5 py-6 text-black shadow-md print:shadow-none"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          <h1 className="text-center text-[18pt] font-bold leading-tight">
            NONCOMMERCIAL INVOICE
          </h1>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[12pt] leading-snug">
            <div className="space-y-0.5">
              {SHIPPER_LINES.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="min-w-[14rem] space-y-0.5 text-left">
              <p>
                <span className="inline-block w-[5.5rem]">Invoice No.:</span>
                <span className="font-bold">{invoiceNo}</span>
              </p>
              <p>
                <span className="inline-block w-[5.5rem]">Date:</span>
                <span>{dateStr}</span>
              </p>
              <p>
                <span className="inline-block w-[5.5rem]">Flight:</span>
                <span>{flightLine || "—"}</span>
              </p>
              <p className="font-semibold">NO PAYMENT</p>
            </div>
          </div>

          <div className="mt-4 text-[12pt] leading-snug">
            <p className="font-bold">THE CNEE:</p>
            {cneeLines.length === 0 ? (
              <p className="text-slate-500 italic">(Chưa có địa chỉ CNEE)</p>
            ) : (
              cneeLines.map((line, i) => (
                <p key={`${i}-${line.slice(0, 24)}`} className="max-w-[85%]">
                  {line}
                </p>
              ))
            )}
          </div>

          {/* ─── Goods table (10 columns matching Excel output) ─── */}
          <table className="mt-5 w-full table-fixed border-collapse text-[10.5pt]">
            <thead>
              <tr>
                <th className="w-[2rem] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  No
                </th>
                <th className="w-[26%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  Description of goods
                </th>
                <th className="w-[10%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  HS code
                </th>
                <th className="w-[3rem] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  Origin
                </th>
                <th className="w-[8%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  Quantity
                </th>
                <th className="w-[7%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  Unit
                </th>
                <th className="w-[9%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  U.Price
                  <br />
                  <span className="font-normal text-[8pt]">(FCA)(USD)</span>
                </th>
                <th className="w-[9%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  Amount
                  <br />
                  <span className="font-normal text-[8pt]">(USD)</span>
                </th>
                <th className="w-[8%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  Quy cách
                  <br />
                  <span className="font-normal text-[8pt]">(kg/đv)</span>
                </th>
                <th className="w-[8%] border border-black px-0.5 py-1 text-center text-[10pt] font-bold">
                  Trọng lượng
                  <br />
                  <span className="font-normal text-[8pt]">(KG)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="border border-black px-2 py-6 text-center text-slate-500 italic"
                  >
                    Chưa có dòng hàng — bảng để trống khi xuất
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const amount = invoiceLineAmountUsd(it);
                  const gross = roundDeclarationKg(invoiceLineGrossWeightKg(it));
                  return (
                    <tr key={it.lineId} className="align-top">
                      <td className="border border-black px-0.5 py-1 text-center">
                        {idx + 1}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-left text-[10pt] leading-snug break-words">
                        {it.description || "—"}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-center text-[9pt]">
                        {it.hsCode || "—"}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-center">
                        {it.origin || "VN"}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-right tabular-nums">
                        {fmtQty(it.quantity)}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-center text-[10pt]">
                        {it.unit || "PCE"}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-right tabular-nums">
                        {fmtUsd(it.unitPriceUsd)}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-right tabular-nums">
                        {fmtUsd(amount)}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-right tabular-nums">
                        {it.kgPerUnit > 0 ? fmtUsd(it.kgPerUnit) : "—"}
                      </td>
                      <td className="border border-black px-0.5 py-1 text-right tabular-nums">
                        {gross > 0 ? String(gross) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
              <tr className="font-bold">
                <td className="border border-black px-0.5 py-1.5" />
                <td className="border border-black px-0.5 py-1.5 text-left text-[11pt]">
                  TOTAL
                </td>
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black px-0.5 py-1.5 text-right tabular-nums">
                  {fmtUsd(totals.totalAmountUsd)}
                </td>
                <td className="border border-black" />
                <td className="border border-black px-0.5 py-1.5 text-right tabular-nums">
                  {totals.totalGrossKg > 0 ? String(totals.totalGrossKg) : "—"}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer */}
          <div className="mt-0 border-t border-black pt-2 text-[12pt] leading-relaxed">
            <p>
              <span className="font-bold">1. Total carton:</span>{" "}
              <span className="ml-2">{cartonFooter}</span>
            </p>
            <p className="mt-1">
              <span className="font-bold">2. Total gross weight:</span>{" "}
              <span className="ml-2">{kgFooter}</span>
            </p>
          </div>

          <details className="mt-4 rounded border border-dashed border-indigo-400/40 bg-indigo-50/40 px-3 py-2 text-[10pt] text-indigo-800">
            <summary className="cursor-pointer font-semibold">Tờ khai HQ — mapping dữ liệu</summary>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[9.5pt]">
              <li>Mô tả hàng → Ô 30 "Mô tả hàng hóa"</li>
              <li>Mã HS → Ô 31 "Mã số HS"</li>
              <li>Xuất xứ → Ô 32 "Xuất xứ"</li>
              <li>Số lượng × Đơn giá = Trị giá → Ô 37 "Trị giá hải quan"</li>
              <li>Invoice No. → Ô 14 "Số hoá đơn thương mại"</li>
              <li>Tổng kiện → Ô 29 "Số lượng kiện"</li>
              <li>Tổng KG → Ô 33 "Trọng lượng"</li>
            </ul>
          </details>
        </article>
      </div>
    </div>
  );
});
