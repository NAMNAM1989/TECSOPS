import * as XLSX from "xlsx";
import type { Shipment } from "../types/shipment";

/** Hiển thị ngày phiên (sessionDate) dạng dd/mm/yyyy cho báo cáo */
export function formatYmdToVnDisplay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function flightCell(row: Shipment): string {
  const f = row.flight.trim();
  const fd = row.flightDate.trim();
  if (f && fd) return `${f} ${fd}`;
  return f || fd;
}

/**
 * Một cột gộp list DIM theo thứ tự mẫu ATTACHED_LIST_DIMS (Chiều dài, rộng, cao, số kiện).
 * Chỉ kho TECS-TCS; mỗi nhóm kiện: `dài,rộng,cao,kiện`, các nhóm nối bằng ` | `.
 */
export function formatTcsDimListColumn(row: Shipment): string {
  if (row.warehouse !== "TECS-TCS" || !row.dimLines?.length) return "";
  const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return row.dimLines
    .map((l) => `${f2(l.lCm)},${f2(l.wCm)},${f2(l.hCm)},${f2(l.pcs)}`)
    .join(" | ");
}

/**
 * Tải file .xlsx: các lô đúng `sessionDate` đang xem, cột theo yêu cầu báo cáo cuối ngày.
 */
export function downloadDayReportExcel(rows: Shipment[], sessionDateYmd: string): void {
  const sorted = [...rows].sort((a, b) => a.stt - b.stt);
  const headerRow = [
    "Ngày hàng vào",
    "AWB",
    "Chuyến bay",
    "DEST",
    "Số kiện",
    "Số KG",
    "DIM kg",
    "DIM nhóm",
    "LIST_DIM_TCS (dài,rộng,cao,kiện)",
    "Tên khách hàng",
    "Note",
  ];
  const aoa: (string | number)[][] = [
    headerRow,
    ...sorted.map((r) => [
      formatYmdToVnDisplay(r.sessionDate),
      r.awb,
      flightCell(r),
      r.dest,
      r.pcs ?? "",
      r.kg ?? "",
      r.dimWeightKg ?? "",
      r.dimLines?.length ?? "",
      formatTcsDimListColumn(r),
      r.customer,
      r.note ?? "",
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 16 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 42 },
    { wch: 28 },
    { wch: 32 },
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = `Ngay_${sessionDateYmd}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fname = `TECSOPS-bao-cao-ngay-${sessionDateYmd}.xlsx`;
  XLSX.writeFile(wb, fname);
}
