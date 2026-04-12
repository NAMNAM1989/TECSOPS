import type { Shipment } from "../types/shipment";
import type { DimDivisor } from "./volumetricDim";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** DIMINSEN từng dòng theo mẫu: (D×R×C×số kiện) ÷ hệ số — làm tròn số nguyên như bảng tính. */
export function diminsenRow(
  lCm: number,
  wCm: number,
  hCm: number,
  pcs: number,
  divisor: DimDivisor
): number {
  return Math.round((lCm * wCm * hCm * pcs) / divisor);
}

export function canPrintDimReport(s: Shipment): boolean {
  return (s.dimLines?.length ?? 0) > 0;
}

/** Form in DIM SCSC — chỉ lô kho SCSC có đủ chi tiết kiện. */
export function canPrintDimScscReport(s: Shipment): boolean {
  return s.warehouse === "TECS-SCSC" && canPrintDimReport(s);
}

/**
 * Mở hộp thoại in trình duyệt với layout giống form DIM (MAWB, chuyến bay, bảng D×R×C×kiện, tổng).
 * Dùng iframe để tương thích mobile hơn window.open.
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

  const divisor = (s.dimDivisor === 5000 || s.dimDivisor === 6000 ? s.dimDivisor : 6000) as DimDivisor;
  const lines = s.dimLines!;

  let totalPcs = 0;
  let totalDiminsen = 0;
  const bodyRows: string[] = [];

  for (const line of lines) {
    const d = diminsenRow(line.lCm, line.wCm, line.hCm, line.pcs, divisor);
    totalPcs += line.pcs;
    totalDiminsen += d;
    bodyRows.push(
      `<tr>
        <td class="num">${line.lCm.toFixed(2)}</td>
        <td class="num">${line.wCm.toFixed(2)}</td>
        <td class="num">${line.hCm.toFixed(2)}</td>
        <td class="num">${line.pcs}</td>
        <td class="num dim">${d}</td>
      </tr>`
    );
  }

  const flightLine = `${esc(s.flight.trim())}/${esc(s.flightDate.trim())}`;
  const title = `DIM ${s.awb}`;

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
      margin: 0 0 10mm 0;
      text-align: center;
      letter-spacing: 0.02em;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 16px;
      margin-bottom: 8mm;
      font-size: 10.5pt;
    }
    .meta-row { display: contents; }
    .meta-row span:first-child { font-weight: 700; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 2mm;
    }
    th, td {
      border: 1px solid #333;
      padding: 6px 8px;
    }
    th {
      background: #f0f0f0;
      font-weight: 700;
      text-align: center;
      font-size: 10pt;
    }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.dim { font-weight: 700; }
    tfoot td {
      font-weight: 700;
      background: #fafafa;
    }
    .foot-label { text-align: left; }
    .note {
      margin-top: 4mm;
      font-size: 9pt;
      color: #555;
    }
    @media print {
      body { padding: 10mm 12mm; }
      @page { size: A4 portrait; margin: 12mm; }
    }
  </style>
</head>
<body>
  <h1>BẢNG KÊ DIM / DIMENSIONAL WEIGHT</h1>
  <div class="meta">
    <div class="meta-row"><span>MAWB/BL:</span><span>${esc(s.awb)}</span></div>
    <div class="meta-row"><span>FLIGHT NO/DATE:</span><span>${flightLine}</span></div>
    <div class="meta-row"><span>DESTINATION:</span><span>${esc(s.dest)}</span></div>
    <div class="meta-row"><span>TOTAL (PCS):</span><span>${totalPcs} PCS</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>DÀI</th>
        <th>RỘNG</th>
        <th>CAO</th>
        <th>SỐ KIỆN</th>
        <th>DIMINSEN</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows.join("\n")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="foot-label">Tổng</td>
        <td class="num">${totalPcs}</td>
        <td class="num dim">${totalDiminsen}</td>
      </tr>
    </tfoot>
  </table>
  <p class="note">Công thức DIMINSEN: (Dài × Rộng × Cao × Số kiện) ÷ ${divisor} (cm³/kg). Trọng DIM lưu hệ thống: ${s.dimWeightKg != null ? s.dimWeightKg + " kg" : "—"}</p>
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
