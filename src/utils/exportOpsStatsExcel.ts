import type { Borders, Fill, Font, Workbook } from "exceljs";
import type {
  OpsStatsDayRow,
  OpsStatsDestRow,
  OpsStatsLotRow,
  OpsStatsTotals,
  OpsStatsWarehouseRow,
} from "./opsStatsMetrics";
import { downloadXlsxBuffer } from "./downloadXlsx";
import { formatStatsPeriodLabel, type StatsPeriodMode } from "./opsStatsPeriod";
import { warehouseLabel } from "../constants/warehouses";
import type { ShipmentStatus } from "../types/shipment";

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: "Booking",
  RECEIVED: "Nhận hàng",
  VOLUME_DONE: "Đã đo Volume",
  CUSTOMS: "Hải quan",
  SECURITY: "An ninh",
  OLA_PULL: "Kéo OLA",
  RECEPTION_COMPLETED: "Hoàn thành tiếp nhận",
  WEIGH_SLIP: "Nộp tờ cân",
  COMPLETED: "Hoàn thành",
};

const HEADER_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F766E" },
};

const HEADER_FONT: Partial<Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 10,
  name: "Calibri",
};

const ZEBRA_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};

const BORDER: Partial<Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

const AGG_HEADERS = [
  "Nhóm",
  "Lô",
  "Kiện",
  "Kg thực",
  "DIM",
  "Chargeable",
  "Δ (CW−Kg)",
  "Lô chưa đo DIM",
] as const;

const LOT_HEADERS = [
  "Ngày phiên",
  "Kho",
  "STT",
  "MAWB",
  "Dest",
  "Chuyến",
  "Khách",
  "Mã KH",
  "Kiện",
  "Kg thực",
  "DIM",
  "Chargeable",
  "Δ",
  "Trạng thái",
  "Ghi chú",
] as const;

function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function opsStatsExportFilename(
  fromYmd: string,
  toYmd: string,
  when = new Date()
): string {
  const a = fromYmd.replace(/-/g, "");
  const b = toYmd !== fromYmd ? `_${toYmd.replace(/-/g, "")}` : "";
  return `OPS_stats_${a}${b}_${fileStamp(when)}.xlsx`;
}

function styleHeader(row: { height?: number; eachCell: (cb: (cell: { fill: Fill; font: Partial<Font>; border: Partial<Borders>; alignment: object }) => void) => void }) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function addAggSheet(
  wb: Workbook,
  name: string,
  keyHeader: string,
  rows: { key: string; totals: OpsStatsTotals }[],
  totals: OpsStatsTotals
): void {
  const sheet = wb.addWorksheet(name.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = [keyHeader, ...AGG_HEADERS.slice(1)];
  const headerRow = sheet.addRow(headers);
  styleHeader(headerRow);

  rows.forEach((r, i) => {
    const row = sheet.addRow([
      r.key,
      r.totals.lots,
      r.totals.pcs,
      r.totals.actualKg,
      r.totals.dimKg,
      r.totals.chargeableKg,
      r.totals.deltaKg,
      r.totals.missingDimLots,
    ]);
    paintDataRow(row, i);
  });

  const totalRow = sheet.addRow([
    "TỔNG",
    totals.lots,
    totals.pcs,
    totals.actualKg,
    totals.dimKg,
    totals.chargeableKg,
    totals.deltaKg,
    totals.missingDimLots,
  ]);
  totalRow.font = { bold: true };
  paintDataRow(totalRow, 0, false);

  sheet.columns = [
    { width: 16 },
    { width: 8 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ];
}

function paintDataRow(
  row: {
    eachCell: (cb: (cell: { border: Partial<Borders>; fill?: Fill; alignment?: object; numFmt?: string }, col: number) => void) => void;
  },
  zebraIndex: number,
  zebra = true
): void {
  row.eachCell((cell, col) => {
    cell.border = BORDER;
    if (zebra && zebraIndex % 2 === 1) cell.fill = ZEBRA_FILL;
    if (col >= 2) {
      cell.alignment = { horizontal: "right" };
      if (col >= 4 && col <= 7) cell.numFmt = "#,##0.###";
    }
  });
}

function addLotsSheet(wb: Workbook, lots: readonly OpsStatsLotRow[]): void {
  const sheet = wb.addWorksheet("Chi tiết lô", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headerRow = sheet.addRow([...LOT_HEADERS]);
  styleHeader(headerRow);

  lots.forEach((lot, i) => {
    const s = lot.shipment;
    const row = sheet.addRow([
      (s.sessionDate || "").trim(),
      warehouseLabel[s.warehouse] ?? s.warehouse,
      s.stt,
      s.awb,
      s.dest,
      s.flight,
      s.customer,
      s.customerCode,
      lot.pcs,
      lot.actualKg,
      lot.dimKg,
      lot.chargeableKg,
      lot.deltaKg,
      STATUS_LABEL[s.status] ?? s.status,
      s.note,
    ]);
    row.eachCell((cell, col) => {
      cell.border = BORDER;
      if (i % 2 === 1) cell.fill = ZEBRA_FILL;
      if (col >= 9 && col <= 13) {
        cell.alignment = { horizontal: "right" };
        if (col >= 10 && col <= 13) cell.numFmt = "#,##0.###";
      }
    });
  });

  sheet.columns = [
    { width: 12 },
    { width: 12 },
    { width: 6 },
    { width: 16 },
    { width: 8 },
    { width: 10 },
    { width: 22 },
    { width: 10 },
    { width: 8 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
    { width: 24 },
  ];
}

export async function buildOpsStatsWorkbook(opts: {
  fromYmd: string;
  toYmd: string;
  mode: StatsPeriodMode;
  warehouseLabel: string;
  destLabel?: string;
  totals: OpsStatsTotals;
  byDay: readonly OpsStatsDayRow[];
  byWarehouse?: readonly OpsStatsWarehouseRow[];
  byDest?: readonly OpsStatsDestRow[];
  lots?: readonly OpsStatsLotRow[];
}): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TECSOPS";
  wb.created = new Date();

  const periodLabel = formatStatsPeriodLabel(
    { fromYmd: opts.fromYmd, toYmd: opts.toYmd },
    opts.mode
  );

  const meta = wb.addWorksheet("Tổng quan");
  meta.addRow(["Kỳ", periodLabel]);
  meta.addRow(["Kho", opts.warehouseLabel]);
  meta.addRow(["Dest", opts.destLabel ?? "Tất cả"]);
  meta.addRow(["Tổng lô", opts.totals.lots]);
  meta.addRow(["Tổng kiện", opts.totals.pcs]);
  meta.addRow(["Kg thực", opts.totals.actualKg]);
  meta.addRow(["DIM", opts.totals.dimKg]);
  meta.addRow(["Chargeable", opts.totals.chargeableKg]);
  meta.addRow(["Δ (CW−Kg)", opts.totals.deltaKg]);
  meta.addRow(["Lô chưa đo DIM", opts.totals.missingDimLots]);
  meta.getColumn(1).width = 18;
  meta.getColumn(2).width = 28;

  addAggSheet(
    wb,
    "Theo ngày",
    "Ngày phiên",
    opts.byDay.map((r) => ({ key: r.sessionDate, totals: r })),
    opts.totals
  );

  if (opts.byWarehouse?.length) {
    addAggSheet(
      wb,
      "Theo kho",
      "Kho",
      opts.byWarehouse.map((r) => ({ key: r.label, totals: r })),
      opts.totals
    );
  }

  if (opts.byDest?.length) {
    addAggSheet(
      wb,
      "Theo dest",
      "Dest",
      opts.byDest.map((r) => ({ key: r.dest, totals: r })),
      opts.totals
    );
  }

  if (opts.lots?.length) {
    addLotsSheet(wb, opts.lots);
  }

  return wb;
}

export async function downloadOpsStatsExcel(opts: {
  fromYmd: string;
  toYmd: string;
  mode: StatsPeriodMode;
  warehouseLabel: string;
  destLabel?: string;
  totals: OpsStatsTotals;
  byDay: readonly OpsStatsDayRow[];
  byWarehouse?: readonly OpsStatsWarehouseRow[];
  byDest?: readonly OpsStatsDestRow[];
  lots?: readonly OpsStatsLotRow[];
}): Promise<void> {
  const wb = await buildOpsStatsWorkbook(opts);
  const buf = await wb.xlsx.writeBuffer();
  downloadXlsxBuffer(
    buf as ArrayBuffer,
    opsStatsExportFilename(opts.fromYmd, opts.toYmd)
  );
}
