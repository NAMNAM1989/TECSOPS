import type { Shipment } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbForFilename, downloadXlsxBuffer } from "./downloadXlsx";
import { escapeHtml, printHtmlViaHiddenIframe } from "./printHtmlViaHiddenIframe";

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function canExportTcsDimTemplate(s: Shipment): boolean {
  return isTcsWarehouse(s.warehouse) && (s.dimLines?.length ?? 0) > 0;
}

/** Xuất một sheet đúng mẫu ATTACHED_LIST_DIMS cho một lô TCS — dynamic import exceljs. */
export async function downloadTcsAttachedDimsExcel(s: Shipment): Promise<void> {
  if (!canExportTcsDimTemplate(s) || !s.dimLines) {
    window.alert("Chỉ áp dụng cho kho TCS (TECS-TCS hoặc KHO TCS) và lô đã có nhập DIM (chi tiết kiện).");
    return;
  }

  try {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(HEADER_ROW);
    for (const l of s.dimLines) {
      const row = ws.addRow([
        round2(l.lCm),
        round2(l.wCm),
        round2(l.hCm),
        round2(l.pcs),
        "",
        "",
        "",
        "",
        "",
      ]);
      for (let c = 1; c <= 4; c++) {
        row.getCell(c).numFmt = "0.00";
      }
    }
    ws.columns = [
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 4 },
      { width: 4 },
      { width: 4 },
      { width: 4 },
      { width: 4 },
    ];

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    downloadXlsxBuffer(buf, `ATTACHED_LIST_DIMS_${awbForFilename(s.awb)}.xlsx`);
  } catch (e) {
    console.error("[downloadTcsAttachedDimsExcel]", e);
    window.alert(e instanceof Error ? e.message : "Không tạo được file Excel.");
  }
}

/** In nhanh bảng DIM cùng layout (4 cột) trong trình duyệt. */
export function printTcsAttachedDimsList(s: Shipment): void {
  if (!canExportTcsDimTemplate(s) || !s.dimLines) {
    window.alert("Chỉ áp dụng cho kho TCS (TECS-TCS hoặc KHO TCS) và lô đã có nhập DIM (chi tiết kiện).");
    return;
  }

  const f2 = (n: number) => round2(n).toFixed(2);
  const rows = s.dimLines
    .map(
      (l) =>
        `<tr><td class="n">${f2(l.lCm)}</td><td class="n">${f2(l.wCm)}</td><td class="n">${f2(l.hCm)}</td><td class="n">${f2(l.pcs)}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/>
<title>${escapeHtml(s.awb)}</title>
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
<p class="meta"><b>MAWB/BL:</b> ${escapeHtml(s.awb)} &nbsp;|&nbsp; <b>Chuyến:</b> ${escapeHtml(s.flight)}/${escapeHtml(s.flightDate)} &nbsp;|&nbsp; <b>DEST:</b> ${escapeHtml(s.dest)}</p>
<table>
<thead><tr><th>Chiều dài</th><th>Chiều rộng</th><th>Chiều cao</th><th>Số kiện</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;

  printHtmlViaHiddenIframe(html, { delayMs: 150 });
}
