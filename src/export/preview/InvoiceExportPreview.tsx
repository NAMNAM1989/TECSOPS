import { memo } from "react";
import type { InvoiceExportPayload } from "../contracts/invoiceExportPayload";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

type Props = {
  exportPayload: InvoiceExportPayload;
};

/** Preview web từ export payload — cùng nội dung với Excel/PDF, layout riêng. */
export const InvoiceExportPreview = memo(function InvoiceExportPreview({ exportPayload: p }: Props) {
  const cartonFooter =
    p.footer.cartons != null && p.footer.cartons > 0 ? `${p.footer.cartons} CTNS` : "—";
  const kgFooter = p.footer.grossKg > 0 ? `${p.footer.grossKg} KGM` : "—";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-2 shrink-0 text-center text-[11px] font-medium text-slate-600 dark:text-slate-400">
        Xem trước Invoice · A4 · cùng dữ liệu export
      </p>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-200/80 p-3 dark:bg-slate-900/80">
        <article
          className="mx-auto w-full max-w-[52rem] bg-white px-5 py-6 text-black shadow-md"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          <h1 className="text-center text-[18pt] font-bold leading-tight">NONCOMMERCIAL INVOICE</h1>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[12pt] leading-snug">
            <div className="space-y-0.5">
              {p.shipper.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="min-w-[14rem] space-y-0.5 text-left">
              <p>
                <span className="inline-block w-[5.5rem]">Invoice No.:</span>
                <span className="font-bold">{p.meta.invoiceNo}</span>
              </p>
              <p>
                <span className="inline-block w-[5.5rem]">Date:</span>
                <span>{p.meta.dateStr}</span>
              </p>
              <p>
                <span className="inline-block w-[5.5rem]">Flight:</span>
                <span>{p.meta.flightLine || "—"}</span>
              </p>
              <p className="font-semibold">NO PAYMENT</p>
            </div>
          </div>

          <div className="mt-4 text-[12pt] leading-snug">
            <p className="font-bold">THE CNEE:</p>
            {p.cnee.lines.length === 0 ? (
              <p className="text-slate-500 italic">(Chưa có địa chỉ CNEE)</p>
            ) : (
              p.cnee.lines.map((line, i) => (
                <p key={`${i}-${line.slice(0, 24)}`} className="max-w-[85%]">
                  {line}
                </p>
              ))
            )}
          </div>

          <table className="mt-5 w-full table-fixed border-collapse text-[10pt]">
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  No
                </th>
                <th className="border border-black px-1 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  Description
                  <br />
                  of goods
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  HS code
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  Origin
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  Qty
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  Unit
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  U.Price
                  <br />
                  <span className="font-normal text-[7.5pt]">(USD)</span>
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  Amount
                  <br />
                  <span className="font-normal text-[7.5pt]">(USD)</span>
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  Quy cách
                  <br />
                  <span className="font-normal text-[7.5pt]">(kg/đv)</span>
                </th>
                <th className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight">
                  Trọng
                  <br />
                  lượng
                </th>
              </tr>
            </thead>
            <tbody>
              {p.lines.length === 0 ? (
                <tr>
                  <td colSpan={10} className="border border-black px-2 py-6 text-center italic text-slate-500">
                    Chưa có dòng hàng
                  </td>
                </tr>
              ) : (
                p.lines.map((line) => (
                  <tr key={line.no} className="align-top">
                    <td className="border border-black px-0.5 py-1 text-center tabular-nums">{line.no}</td>
                    <td className="border border-black px-1 py-1 text-left text-[9.5pt] leading-snug break-words [overflow-wrap:anywhere]">
                      {line.description || "—"}
                    </td>
                    <td className="border border-black px-0.5 py-1 text-center text-[8.5pt]">
                      {line.hsCode || "—"}
                    </td>
                    <td className="border border-black px-0.5 py-1 text-center text-[9pt]">{line.origin}</td>
                    <td className="border border-black px-0.5 py-1 text-right text-[9pt] tabular-nums">
                      {fmtQty(line.quantity)}
                    </td>
                    <td className="border border-black px-0.5 py-1 text-center text-[8.5pt]">{line.unit}</td>
                    <td className="border border-black px-0.5 py-1 text-right text-[9pt] tabular-nums">
                      {fmtUsd(line.unitPriceUsd)}
                    </td>
                    <td className="border border-black px-0.5 py-1 text-right text-[9pt] tabular-nums">
                      {fmtUsd(line.amountUsd)}
                    </td>
                    <td className="border border-black px-0.5 py-1 text-right text-[9pt] tabular-nums">
                      {line.kgPerUnit > 0 ? fmtUsd(line.kgPerUnit) : "—"}
                    </td>
                    <td className="border border-black px-0.5 py-1 text-right text-[9pt] tabular-nums">
                      {line.grossKg > 0 ? String(line.grossKg) : "—"}
                    </td>
                  </tr>
                ))
              )}
              <tr className="font-bold">
                <td className="border border-black" />
                <td className="border border-black px-1 py-1.5 text-left text-[10pt]">TOTAL</td>
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black" />
                <td className="border border-black px-0.5 py-1.5 text-right tabular-nums">
                  {fmtUsd(p.totals.totalAmountUsd)}
                </td>
                <td className="border border-black" />
                <td className="border border-black px-0.5 py-1.5 text-right tabular-nums">
                  {p.totals.totalGrossKg > 0 ? String(p.totals.totalGrossKg) : "—"}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-2 text-[12pt] leading-relaxed">
            <p>
              <span className="font-bold">1. Total carton:</span> {cartonFooter}
            </p>
            <p className="mt-1">
              <span className="font-bold">2. Total gross weight:</span> {kgFooter}
            </p>
          </div>
        </article>
      </div>
    </div>
  );
});
