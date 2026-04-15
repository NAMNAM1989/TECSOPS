import type { Shipment } from "../types/shipment";
import { buildScscDimListModel, formatLineDimKgLabel } from "./scscDimListReport";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function canPrintDimReport(s: Shipment): boolean {
  return (s.dimLines?.length ?? 0) > 0;
}

/** Form in DIM SCSC — chỉ lô kho SCSC có đủ chi tiết kiện. */
export function canPrintDimScscReport(s: Shipment): boolean {
  return s.warehouse === "TECS-SCSC" && canPrintDimReport(s);
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
  if (s.warehouse !== "TECS-SCSC") {
    window.alert(
      "Form in DIM SCSC chỉ dùng cho lô kho SCSC. Lô kho TCS dùng LIST DIM TCS / IN DIM TCS."
    );
    return;
  }

  const model = buildScscDimListModel(s);
  if (!model) {
    window.alert("Không đọc được dữ liệu DIM.");
    return;
  }

  const flightLine = `${esc(s.flight.trim())} / ${esc(s.flightDate.trim())}`;
  const title = `DIM ${s.awb}`;
  const dimKgStripEsc = esc(model.dimKgStrip);

  const bodyRows = model.rows
    .map(
      (line) =>
        `<tr>
        <td class="stt">${line.stt}</td>
        <td class="num">${line.lCm.toFixed(2)}</td>
        <td class="num">${line.wCm.toFixed(2)}</td>
        <td class="num">${line.hCm.toFixed(2)}</td>
        <td class="num">${line.pcs}</td>
        <td class="num dim">${esc(formatLineDimKgLabel(line.dimKg, model.policy))}</td>
      </tr>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
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
    <tr><td class="meta-k">MAWB/BL</td><td class="meta-v">${esc(s.awb)}</td></tr>
    <tr><td class="meta-k">FLIGHT / DATE</td><td class="meta-v">${flightLine}</td></tr>
    <tr><td class="meta-k">DESTINATION</td><td class="meta-v">${esc(s.dest)}</td></tr>
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

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "none",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    window.alert("Không tạo được khung in.");
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  win.addEventListener("afterprint", cleanup);

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      window.alert("Không gọi được lệnh in.");
      cleanup();
    }
  };

  setTimeout(() => {
    if (iframe.contentDocument?.readyState === "complete") {
      runPrint();
    } else {
      win.addEventListener("load", runPrint, { once: true });
    }
  }, 100);

  setTimeout(cleanup, 120000);
}
