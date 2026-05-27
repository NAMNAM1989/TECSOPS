import { useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  invoiceLineAmountUsd,
  invoiceLineGrossWeightKg,
  totalsForInvoice,
  type InvoiceLineItem,
} from "../types/invoiceItem";
import { buildShipmentCneeBodyLines } from "../utils/shipmentCneeCopyBlock";
import {
  buildInvoiceNumber,
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
};

export function ShipmentInvoiceSheetPreview({
  shipment,
  customerDirectory,
  items,
}: Props) {
  const at = useMemo(() => new Date(), []);
  const invoiceNo = useMemo(
    () => buildInvoiceNumber(shipment, customerDirectory, at),
    [shipment, customerDirectory, at]
  );
  const dateStr = formatInvoiceSheetDate(at);
  const flight = (shipment.flight ?? "").trim().toUpperCase();
  const cneeLines = useMemo(
    () => buildShipmentCneeBodyLines(shipment, customerDirectory),
    [shipment, customerDirectory]
  );
  const totals = useMemo(() => totalsForInvoice(items), [items]);

  const cartonFooter =
    shipment.pcs != null && shipment.pcs > 0 ? `${shipment.pcs} CTNS` : "—";
  const kgFooter = shipment.kg != null && shipment.kg > 0 ? `${shipment.kg} KGM` : "—";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-2 shrink-0 text-center text-[11px] font-medium text-slate-600 dark:text-slate-400">
        Xem trước như file in · A4 · Times New Roman
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
                <span className="inline-block w-[5.5rem]">InvoiceNo.:</span>
                <span className="font-normal">{invoiceNo}</span>
              </p>
              <p>
                <span className="inline-block w-[5.5rem]">Date:</span>
                <span>{dateStr}</span>
              </p>
              <p>
                <span className="inline-block w-[5.5rem]">Flight:</span>
                <span>{flight || "—"}</span>
              </p>
              <p className="font-semibold">NO PAYMENT</p>
            </div>
          </div>

          <div className="mt-4 text-[12pt] leading-snug">
            <p className="font-normal">THE CNEE:</p>
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

          <table className="mt-5 w-full border-collapse text-[11pt]">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="w-[2.2rem] border border-black px-1 py-1 text-center font-bold"
                >
                  No
                </th>
                <th
                  colSpan={2}
                  rowSpan={2}
                  className="min-w-[12rem] border border-black px-1 py-1 text-center font-bold"
                >
                  Depcription of goods
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-1 py-1 text-center font-bold"
                >
                  HS code
                </th>
                <th
                  rowSpan={2}
                  className="w-[3rem] border border-black px-1 py-1 text-center font-bold"
                >
                  Origin
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-1 py-1 text-center font-bold"
                >
                  Quantity
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-1 py-1 text-center font-bold"
                >
                  Unit
                </th>
                <th className="border border-black px-1 py-0.5 text-center font-bold">
                  U.Price (FCA)
                </th>
                <th className="border border-black px-1 py-0.5 text-center font-bold">
                  Amount
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-1 py-1 text-center font-bold"
                >
                  Unit wt (kg)
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-1 py-1 text-center font-bold"
                >
                  Gross wt (kg)
                </th>
              </tr>
              <tr>
                <th className="border border-black px-1 py-0.5 text-center font-normal">USD</th>
                <th className="border border-black px-1 py-0.5 text-center font-normal">USD</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="border border-black px-2 py-6 text-center text-slate-500 italic"
                  >
                    Chưa có dòng hàng — bảng để trống khi xuất
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const amount = invoiceLineAmountUsd(it);
                  const gross = invoiceLineGrossWeightKg(it);
                  return (
                    <tr key={it.lineId} className="align-top">
                      <td className="border border-black px-1 py-1.5 text-center">{idx + 1}</td>
                      <td
                        colSpan={2}
                        className="border border-black px-1 py-1.5 text-left leading-snug"
                      >
                        {it.description || "—"}
                      </td>
                      <td className="border border-black px-1 py-1.5 text-center text-[10pt]">
                        {it.hsCode || "—"}
                      </td>
                      <td className="border border-black px-1 py-1.5 text-center">
                        {it.origin || "VN"}
                      </td>
                      <td className="border border-black px-1 py-1.5 text-right tabular-nums">
                        {fmtQty(it.quantity)}
                      </td>
                      <td className="border border-black px-1 py-1.5 text-center">
                        {it.unit || "PCE"}
                      </td>
                      <td className="border border-black px-1 py-1.5 text-right tabular-nums">
                        {fmtUsd(it.unitPriceUsd)}
                      </td>
                      <td
                        className="border border-black px-1 py-1.5 text-right font-normal tabular-nums"
                        style={{ color: "#00B050" }}
                      >
                        {fmtUsd(amount)}
                      </td>
                      <td className="border border-black px-1 py-1.5 text-right tabular-nums">
                        {fmtUsd(it.kgPerUnit)}
                      </td>
                      <td
                        className="border border-black px-1 py-1.5 text-right tabular-nums"
                        style={{ color: "#00B050" }}
                      >
                        {fmtUsd(gross)}
                      </td>
                    </tr>
                  );
                })
              )}
              <tr className="font-bold">
                <td
                  colSpan={3}
                  className="border border-black px-1 py-2 text-center text-[12pt]"
                >
                  TOTAL
                </td>
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black px-1 py-2 text-center tabular-nums">
                  {fmtQty(totals.totalQuantity)}
                </td>
                <td className="border border-black" />
                <td className="border border-black" />
                <td
                  className="border border-black px-1 py-2 text-center tabular-nums"
                  style={{ color: "#00B050" }}
                >
                  {fmtUsd(totals.totalAmountUsd)}
                </td>
                <td className="border border-black" />
                <td
                  className="border border-black px-1 py-2 text-center tabular-nums"
                  style={{ color: "#00B050" }}
                >
                  {fmtUsd(totals.totalGrossKg)}
                </td>
              </tr>
            </tbody>
          </table>

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
        </article>
      </div>
    </div>
  );
}
