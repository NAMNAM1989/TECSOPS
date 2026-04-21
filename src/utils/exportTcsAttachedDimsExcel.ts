import * as XLSX from "xlsx";
import type { Shipment } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";

/** Giống mẫu `ATTACHED_LIST_DIMS.xlsx`: 4 cột kích thước + cột trống. */
const HEADER_ROW: (string | number)[] = [
  "Chiều dài",
  "Chiều rộng",
  "Chiều cao",
  "Số kiện",
  "",
  "",
  "",
  "",
  "",
];

function awbForFilename(awb: string): string {
  return awb.replace(/[^\dA-Za-z-]+/g, "_").slice(0, 40) || "AWB";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Định dạng số 2 chữ số thập phân cho ô Excel (kiểu số + hiển thị 0.00). */
function applyDimCellsTwoDecimals(ws: XLSX.WorkSheet) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 0; c <= 3; c++) {
      const a = XLSX.utils.encode_cell({ r, c });
      const cell = ws[a];
      if (!cell || cell.v === "" || cell.v == null) continue;
      const n = typeof cell.v === "number" ? cell.v : Number(cell.v);
      if (!Number.isFinite(n)) continue;
      ws[a] = { t: "n", v: round2(n), z: "0.00" };
    }
  }
}

export function canExportTcsDimTemplate(s: Shipment): boolean {
  return isTcsWarehouse(s.warehouse) && (s.dimLines?.length ?? 0) > 0;
}

/** Xuất một sheet đúng mẫu ATTACHED_LIST_DIMS cho một lô TCS. */
export function downloadTcsAttachedDimsExcel(s: Shipment): void {
  if (!canExportTcsDimTemplate(s) || !s.dimLines) {
    window.alert("Chỉ áp dụng cho kho TCS (TECS-TCS hoặc KHO TCS) và lô đã có nhập DIM (chi tiết kiện).");
    return;
  }

  const aoa: (string | number)[][] = [
    HEADER_ROW,
    ...s.dimLines.map((l) => [
      round2(l.lCm),
      round2(l.wCm),
      round2(l.hCm),
      round2(l.pcs),
      "",
      "",
      "",
      "",
      "",
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  applyDimCellsTwoDecimals(ws);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fname = `ATTACHED_LIST_DIMS_${awbForFilename(s.awb)}.xlsx`;
  XLSX.writeFile(wb, fname);
}

/** In nhanh bảng DIM cùng layout (4 cột) trong trình duyệt. */
export function printTcsAttachedDimsList(s: Shipment): void {
  if (!canExportTcsDimTemplate(s) || !s.dimLines) {
    window.alert("Chỉ áp dụng cho kho TCS (TECS-TCS hoặc KHO TCS) và lô đã có nhập DIM (chi tiết kiện).");
    return;
  }

  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const f2 = (n: number) => round2(n).toFixed(2);
  const rows = s.dimLines
    .map(
      (l) =>
        `<tr><td class="n">${f2(l.lCm)}</td><td class="n">${f2(l.wCm)}</td><td class="n">${f2(l.hCm)}</td><td class="n">${f2(l.pcs)}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/>
<title>${esc(s.awb)}</title>
<style>
body{font-family:Arial,sans-serif;padding:16px;font-size:11pt;}
h1{font-size:12pt;margin:0 0 8px;}
.meta{margin-bottom:12px;font-size:10pt;color:#333;}
table{border-collapse:collapse;width:100%;max-width:560px;}
th,td{border:1px solid #333;padding:6px 8px;}
th{background:#f0f0f0;}
td.n{text-align:right;font-variant-numeric:tabular-nums;}
@media print{@page{margin:12mm;}body{padding:0;}}
</style></head><body>
<h1>LIST DIM — kho TCS</h1>
<p class="meta"><b>MAWB/BL:</b> ${esc(s.awb)} &nbsp;|&nbsp; <b>Chuyến:</b> ${esc(s.flight)}/${esc(s.flightDate)} &nbsp;|&nbsp; <b>DEST:</b> ${esc(s.dest)}</p>
<table>
<thead><tr><th>Chiều dài</th><th>Chiều rộng</th><th>Chiều cao</th><th>Số kiện</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;

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
  setTimeout(() => {
    win.focus();
    win.print();
  }, 150);
  setTimeout(cleanup, 120000);
}
