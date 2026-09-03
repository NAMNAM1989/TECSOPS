import type { H21InvoiceDocument } from "../../shared/scscH21InvoiceCore.d.ts";
import { formatH21InvoiceCneeDisplay } from "../utils/h21InvoiceCneeFormat";

type Props = {
  doc: H21InvoiceDocument;
};

/** Xem trước invoice H21 — layout giống mẫu NONCOMMERCIAL INVOICE. */
export function ScscH21InvoiceReview({ doc }: Props) {
  const cnee = formatH21InvoiceCneeDisplay(doc.cnee);

  return (
    <article
      className="mx-auto max-w-[820px] rounded-lg border border-neutral-300 bg-white p-6 text-[11px] leading-snug text-neutral-900 shadow-md print:shadow-none"
      data-testid="scsc-h21-invoice-review"
    >
      <h1 className="mb-4 text-center text-sm font-bold tracking-wide">{doc.title}</h1>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 font-bold">THE SHIPPER:</div>
          <div className="font-semibold">{doc.shipper.name || "—"}</div>
          <div className="text-neutral-700">{doc.shipper.address}</div>
          <div>{doc.shipper.phone}</div>
        </div>
        <div className="space-y-0.5 sm:text-right">
          <div>
            <span className="font-bold">INVOICE NO.: </span>
            <span className="font-mono">{doc.invoiceNo || "—"}</span>
          </div>
          <div>
            <span className="font-bold">DATE: </span>
            {doc.dateLabel}
          </div>
          <div>
            <span className="font-bold">FLIGHT: </span>
            {doc.flightLabel}
          </div>
          <div className="font-semibold">{doc.paymentNote}</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 font-bold">THE CNEE:</div>
        <div className="space-y-0.5 pl-0">
          <div className="font-semibold leading-snug">{cnee.nameLine || "—"}</div>
          {cnee.addressLines.map((line) => (
            <div key={line} className="leading-snug text-neutral-800">
              {line}
            </div>
          ))}
          {cnee.phoneLine ? (
            <div className="leading-snug text-neutral-900">{cnee.phoneLine}</div>
          ) : null}
          {cnee.emailLine ? (
            <div className="leading-snug text-neutral-700">{cnee.emailLine}</div>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[10px]">
          <thead>
            <tr className="border border-neutral-400 bg-neutral-100">
              <th className="border border-neutral-400 px-1 py-1">No</th>
              <th className="border border-neutral-400 px-1 py-1 text-left">
                Depcription of goods
              </th>
              <th className="border border-neutral-400 px-1 py-1">Xuất Xứ</th>
              <th className="border border-neutral-400 px-1 py-1">Quantity</th>
              <th className="border border-neutral-400 px-1 py-1">ĐVT</th>
              <th className="border border-neutral-400 px-1 py-1">Trọng lượng (KGM)</th>
              <th className="border border-neutral-400 px-1 py-1">U.Price (FCA)</th>
              <th className="border border-neutral-400 px-1 py-1">Amount</th>
            </tr>
            <tr className="border border-neutral-400">
              <th className="border border-neutral-400" colSpan={6} />
              <th className="border border-neutral-400 px-1 py-0.5">USD</th>
              <th className="border border-neutral-400 px-1 py-0.5">USD</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="border border-neutral-300 px-2 py-6 text-center text-neutral-500"
                >
                  Chưa có dòng hàng — tạo ngẫu nhiên hoặc chọn từ catalog.
                </td>
              </tr>
            ) : (
              doc.lines.map((line) => (
                <tr key={line.no}>
                  <td className="border border-neutral-300 px-1 py-0.5 text-center">{line.no}</td>
                  <td className="border border-neutral-300 px-1 py-0.5">{line.description}</td>
                  <td className="border border-neutral-300 px-1 py-0.5 text-center">{line.origin}</td>
                  <td className="border border-neutral-300 px-1 py-0.5 text-right">{line.quantity}</td>
                  <td className="border border-neutral-300 px-1 py-0.5 text-center">{line.uom}</td>
                  <td className="border border-neutral-300 px-1 py-0.5 text-right">{line.weightKg}</td>
                  <td className="border border-neutral-300 px-1 py-0.5 text-right">{line.unitPrice}</td>
                  <td className="border border-neutral-300 px-1 py-0.5 text-right">{line.amount}</td>
                </tr>
              ))
            )}
            <tr className="font-bold">
              <td className="border border-neutral-400 px-1 py-1" colSpan={5}>
                TOTAL
              </td>
              <td className="border border-neutral-400 px-1 py-1 text-right">
                {doc.footer.linesKg}
              </td>
              <td className="border border-neutral-400 px-1 py-1" />
              <td className="border border-neutral-400 px-1 py-1 text-right">
                {doc.footer.lineAmount}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 space-y-0.5">
        <div>
          1. Total carton: {doc.footer.totalCartonPkgs} PKGS
          {doc.footer.linesKg > 0 ? (
            <span className="text-neutral-600">
              {" "}
              (dư {doc.footer.residualKg} kg = KG tờ khai − trọng lượng dòng)
            </span>
          ) : null}
        </div>
        <div>2. Total gross weight: {doc.footer.grossKg} KGM</div>
      </div>
      <p className="mt-1.5 italic text-neutral-600">{doc.customsNote}</p>

      {doc.shipper.sealImageData ? (
        <div className="mt-1 flex flex-col items-end">
          <img
            src={doc.shipper.sealImageData}
            alt=""
            className="h-24 w-auto max-w-[170px] object-contain object-top"
          />
        </div>
      ) : null}
    </article>
  );
}
