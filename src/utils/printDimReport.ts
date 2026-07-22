import type { Shipment } from "../types/shipment";
import { isScscWarehouse } from "../constants/warehouses";
import { buildScscDimListModel } from "./scscDimListReport";
import { escapeHtml, printHtmlViaHiddenIframe } from "./printHtmlViaHiddenIframe";
import { formatLineDimKgDisplay } from "./volumetricDim";

export function canPrintDimReport(s: Shipment): boolean {
  return (s.dimLines?.length ?? 0) > 0;
}

/** Form in DIM SCSC — chỉ lô kho SCSC có đủ chi tiết kiện. */
export function canPrintDimScscReport(s: Shipment): boolean {
  return isScscWarehouse(s.warehouse) && canPrintDimReport(s);
}

/**
 * Mở hộp thoại in trình duyệt với layout trùng LIST SCSC / Excel (meta + bảng STT×D×R×C×kiện×DIM kg).
 * DIM từng dòng = lineDimKg + format theo chuyến (giống modal nhập).
 */
export function printDimReport(s: Shipment): void {
  if (!canPrintDimReport(s)) {
    window.alert("Chưa có chi tiết DIM (D×R×C×kiện). Hãy nhập DIM trên điện thoại trước.");
    return;
  }
  if (!isScscWarehouse(s.warehouse)) {
    window.alert(
      "Form in DIM SCSC chỉ dùng cho lô kho SCSC (TECS-SCSC hoặc KHO SCSC). Lô kho TCS dùng LIST DIM TCS / IN DIM TCS."
    );
    return;
  }

  const model = buildScscDimListModel(s);
  if (!model) {
    window.alert("Không đọc được dữ liệu DIM.");
    return;
  }

  const flightLine = `${escapeHtml(s.flight.trim())} / ${escapeHtml(s.flightDate.trim())}`;
  const title = `DIM ${s.awb}`;
  const dimKgStripEsc = escapeHtml(model.dimKgStrip);

  const bodyRows = model.rows
    .map(
      (line) =>
        `<tr>
        <td class="stt">${line.stt}</td>
        <td class="num">${line.lCm.toFixed(2)}</td>
        <td class="num">${line.wCm.toFixed(2)}</td>
        <td class="num">${line.hCm.toFixed(2)}</td>
        <td class="num">${line.pcs}</td>
        <td class="num dim">${escapeHtml(line.dimKg == null ? "—" : formatLineDimKgDisplay(line.dimKg, model.dimCtx))}</td>
      </tr>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 12mm 14mm;
      color: #111;
      font-size: 11pt;
    }
    h1 {
      font-size: 13pt;
      margin: 0 0 6mm 0;
      text-align: center;
      letter-spacing: 0.02em;
    }
    table.meta-tbl {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 7mm;
      font-size: 10.5pt;
    }
    table.meta-tbl td {
      border: none;
      padding: 3px 0 3px 0;
      vertical-align: top;
    }
    table.meta-tbl td.meta-k {
      font-weight: 700;
      width: 36%;
      color: #000;
      padding-right: 10px;
    }
    table.meta-tbl td.meta-v {
      color: #000;
    }
    table.dim-tbl {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1mm;
    }
    table.dim-tbl th,
    table.dim-tbl td {
      border: 1px solid #000;
      padding: 6px 8px;
      background: #fff;
      color: #000;
    }
    table.dim-tbl th {
      font-weight: 700;
      text-align: center;
      font-size: 10pt;
    }
    td.stt {
      text-align: center;
      font-variant-numeric: tabular-nums;
      width: 2.6em;
    }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.dim { font-weight: 700; }
    @media print {
      body { padding: 10mm 12mm; }
      @page { size: A4 portrait; margin: 12mm; }
    }
  </style>
</head>
<body>
  <h1>BẢNG KÊ DIM / DIMENSIONAL WEIGHT</h1>
  <table class="meta-tbl">
    <tr><td class="meta-k">MAWB/BL</td><td class="meta-v">${escapeHtml(s.awb)}</td></tr>
    <tr><td class="meta-k">FLIGHT / DATE</td><td class="meta-v">${flightLine}</td></tr>
    <tr><td class="meta-k">DESTINATION</td><td class="meta-v">${escapeHtml(s.dest)}</td></tr>
    <tr><td class="meta-k">Tổng kiện</td><td class="meta-v">${model.totalPcs}</td></tr>
    <tr><td class="meta-k">DIM (kg)</td><td class="meta-v">${dimKgStripEsc}</td></tr>
  </table>
  <table class="dim-tbl">
    <thead>
      <tr>
        <th>STT</th>
        <th>DÀI</th>
        <th>RỘNG</th>
        <th>CAO</th>
        <th>SỐ KIỆN</th>
        <th>DIM (kg)</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
</body>
</html>`;

  printHtmlViaHiddenIframe(html, { failAlert: "Không tạo được khung in." });
}
