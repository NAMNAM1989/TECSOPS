import { forwardRef, memo } from "react";
import type { InvoiceExportPayload } from "../contracts/invoiceExportPayload";
import { A4_HEIGHT_MM, A4_WIDTH_MM } from "../../utils/printMmUnits";

/** Lề in PDF (@page invoicePdfHtml.mjs). */
export const INVOICE_A4_MARGIN_MM = { top: 12, right: 10, bottom: 14, left: 10 } as const;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtKg(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

type Props = {
  payload: InvoiceExportPayload;
  className?: string;
};

/** Nội dung tờ invoice — tách khỏi shell preview. */
export const InvoiceA4Document = memo(
  forwardRef<HTMLElement, Props>(function InvoiceA4Document({ payload: p, className = "" }, ref) {
  const cartonFooter =
    p.footer.cartons != null && p.footer.cartons > 0 ? `${p.footer.cartons} CTNS` : "—";
  const kgFooter = p.footer.grossKg > 0 ? `${fmtKg(p.footer.grossKg)} KGM` : "—";

  return (
    <article
      ref={ref}
      className={`bg-white text-black ${className}`}
      style={{
        width: `${A4_WIDTH_MM}mm`,
        minHeight: `${A4_HEIGHT_MM}mm`,
        padding: `${INVOICE_A4_MARGIN_MM.top}mm ${INVOICE_A4_MARGIN_MM.right}mm ${INVOICE_A4_MARGIN_MM.bottom}mm ${INVOICE_A4_MARGIN_MM.left}mm`,
        boxSizing: "border-box",
        fontFamily: '"Times New Roman", Times, serif',
      }}
    >
      <h1 className="text-center text-[18pt] font-bold leading-tight">
        NONCOMMERCIAL INVOICE &amp; PACKING LIST
      </h1>

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
          <p className="text-neutral-500 italic">(Chưa có địa chỉ CNEE)</p>
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
            {[
              "No",
              "Description\nof goods",
              "HS code",
              "Origin",
              "Qty",
              "Unit",
              "U.Price\n(USD)",
              "Amount\n(USD)",
              "Quy cách\n(kg/đv)",
              "Trọng\nlượng",
            ].map((label) => (
              <th
                key={label}
                className="border border-black px-0.5 py-1 text-center text-[8.5pt] font-bold leading-tight whitespace-pre-line"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.lines.length === 0 ? (
            <tr>
              <td colSpan={10} className="border border-black px-2 py-8 text-center italic text-neutral-500">
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
                <td className="border border-black px-0.5 py-1 text-center text-[8.5pt]">{line.hsCode || "—"}</td>
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
                  {fmtKg(line.grossKg)}
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
              {fmtKg(p.totals.totalGrossKg)}
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
  );
  })
);
