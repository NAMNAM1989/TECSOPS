function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtKg(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v));
}

/**
 * HTML A4 riêng cho PDF export — không dùng CSS web app.
 * @param {import('../../src/export/contracts/invoiceExportPayload.ts').InvoiceExportPayload} payload
 */
export function buildInvoiceExportHtml(payload) {
  const shipper = payload.shipper?.lines ?? [];
  const cnee = payload.cnee?.lines ?? [];
  const lines = payload.lines ?? [];

  const rows = lines
    .map(
      (l) => `<tr>
        <td class="c">${l.no}</td>
        <td class="l">${escapeHtml(l.description)}</td>
        <td class="c">${escapeHtml(l.hsCode)}</td>
        <td class="c">${escapeHtml(l.origin || "VN")}</td>
        <td class="r">${fmtQty(l.quantity)}</td>
        <td class="c">${escapeHtml(l.unit)}</td>
        <td class="r">${fmtUsd(l.unitPriceUsd)}</td>
        <td class="r">${fmtUsd(l.amountUsd)}</td>
        <td class="r">${l.kgPerUnit > 0 ? fmtUsd(l.kgPerUnit) : ""}</td>
        <td class="r">${fmtKg(l.grossKg)}</td>
      </tr>`
    )
    .join("");

  const carton =
    payload.footer?.cartons != null && payload.footer.cartons > 0
      ? `${payload.footer.cartons} CTNS`
      : "—";
  const kg =
    payload.footer?.grossKg != null && payload.footer.grossKg > 0
      ? `${fmtKg(payload.footer.grossKg)} KGM`
      : "—";

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<style>
@page { size: A4 portrait; margin: 12mm 10mm 14mm 10mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Times New Roman", Times, serif;
  font-size: 11pt;
  color: #000;
  line-height: 1.25;
}
h1 { text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 6mm; }
.header { display: table; width: 100%; margin-bottom: 5mm; }
.header-left, .header-right { display: table-cell; vertical-align: top; }
.header-left { width: 55%; }
.header-right { width: 45%; padding-left: 4mm; }
.meta-row { margin-bottom: 1.5mm; }
.meta-label { display: inline-block; width: 22mm; }
.cnee { margin-bottom: 4mm; }
.cnee-title { font-weight: bold; margin-bottom: 1mm; }
table.goods {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 9.5pt;
}
table.goods th, table.goods td {
  border: 0.3mm solid #000;
  padding: 1.2mm 1mm;
  vertical-align: top;
  word-wrap: break-word;
}
table.goods th { font-weight: bold; text-align: center; font-size: 9pt; }
.c { text-align: center; }
.r { text-align: right; }
.l { text-align: left; }
.total td { font-weight: bold; }
.footer { margin-top: 4mm; font-size: 11pt; }
.footer p { margin-bottom: 2mm; }
.col-no { width: 6%; }
.col-desc { width: 26%; }
.col-hs { width: 11%; }
.col-origin { width: 7%; }
.col-qty { width: 8%; }
.col-unit { width: 7%; }
.col-price { width: 9%; }
.col-amt { width: 9%; }
.col-spec { width: 8%; }
.col-wt { width: 9%; }
</style>
</head>
<body>
<h1>NONCOMMERCIAL INVOICE & PACKING LIST</h1>
<div class="header">
  <div class="header-left">
    ${shipper.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
  </div>
  <div class="header-right">
    <div class="meta-row"><span class="meta-label">Invoice No.:</span><strong>${escapeHtml(payload.meta.invoiceNo)}</strong></div>
    <div class="meta-row"><span class="meta-label">Date:</span>${escapeHtml(payload.meta.dateStr)}</div>
    <div class="meta-row"><span class="meta-label">Flight:</span>${escapeHtml(payload.meta.flightLine)}</div>
    <div class="meta-row"><strong>NO PAYMENT</strong></div>
  </div>
</div>
<div class="cnee">
  <div class="cnee-title">THE CNEE:</div>
  ${cnee.length ? cnee.map((l) => `<div>${escapeHtml(l)}</div>`).join("") : "<div>—</div>"}
</div>
<table class="goods">
  <thead>
    <tr>
      <th class="col-no">No</th>
      <th class="col-desc">Description of goods</th>
      <th class="col-hs">HS code</th>
      <th class="col-origin">Origin</th>
      <th class="col-qty">Quantity</th>
      <th class="col-unit">Unit</th>
      <th class="col-price">U.Price<br/>(FCA)(USD)</th>
      <th class="col-amt">Amount<br/>(USD)</th>
      <th class="col-spec">Quy cách<br/>(kg/đv)</th>
      <th class="col-wt">Trọng lượng<br/>(KG)</th>
    </tr>
  </thead>
  <tbody>
    ${rows || `<tr><td colspan="10" class="c">—</td></tr>`}
    <tr class="total">
      <td></td>
      <td class="l">TOTAL</td>
      <td></td><td></td><td></td><td></td><td></td>
      <td class="r">${fmtUsd(payload.totals?.totalAmountUsd ?? 0)}</td>
      <td></td>
      <td class="r">${fmtKg(payload.totals?.totalGrossKg ?? 0)}</td>
    </tr>
  </tbody>
</table>
<div class="footer">
  <p><strong>1. Total carton:</strong> ${escapeHtml(carton)}</p>
  <p><strong>2. Total gross weight:</strong> ${escapeHtml(kg)}</p>
</div>
</body>
</html>`;
}
