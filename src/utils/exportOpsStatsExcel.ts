import type { Borders, Fill, Font, Workbook } from "exceljs";
import type {
  OpsStatsDayRow,
  OpsStatsDestRow,
  OpsStatsLotRow,
  OpsStatsTotals,
  OpsStatsWarehouseRow,
} from "./opsStatsMetrics";
import type { OpsStatsIntelligence } from "./opsStatsIntelligence";
import { downloadXlsxBuffer } from "./downloadXlsx";
import { formatStatsPeriodLabel, type StatsPeriodMode } from "./opsStatsPeriod";
import { warehouseLabel } from "../constants/warehouses";
import { statusLabel } from "../components/statusStyles";

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
      statusLabel[s.status] ?? s.status,
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
  intelligence?: OpsStatsIntelligence;
  /** Nhãn filter phụ (khách/chuyến/status…) ghi sheet Tổng quan */
  filterMeta?: Record<string, string>;
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
  if (opts.intelligence) {
    meta.addRow(["% Volume done", opts.intelligence.volumeDonePct]);
    meta.addRow(["Focus ngày", opts.intelligence.focusYmd]);
    meta.addRow(["HHI khách (kg)", opts.intelligence.customerShare.hhiKg]);
    meta.addRow(["HHI dest (kg)", opts.intelligence.destShare.hhiKg]);
    meta.addRow(["HHI hãng (kg)", opts.intelligence.airlineShare.hhiKg]);
  }
  if (opts.filterMeta) {
    for (const [k, v] of Object.entries(opts.filterMeta)) {
      meta.addRow([k, v]);
    }
  }
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

  const intel = opts.intelligence;
  if (intel) {
    const booking = wb.addWorksheet("Booking flight-dest", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const bHeader = booking.addRow([
      "Chuyến",
      "Dest",
      "Lô",
      "Kg",
      "TB DOW lô",
      "Surge",
      "Tín hiệu",
    ]);
    styleHeader(bHeader);
    intel.flightDest.forEach((r, i) => {
      const row = booking.addRow([
        r.flightKey,
        r.dest,
        r.lots,
        r.actualKg,
        r.baselineLots,
        r.surgeLots,
        r.signal,
      ]);
      paintDataRow(row, i);
    });
    booking.columns = [
      { width: 12 },
      { width: 8 },
      { width: 8 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 12 },
    ];

    const market = wb.addWorksheet("Share khách", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const mHeader = market.addRow(["Khách", "Lô", "Kg", "% lô", "% kg"]);
    styleHeader(mHeader);
    intel.customerShare.rows.forEach((r, i) => {
      const row = market.addRow([r.label, r.lots, r.actualKg, r.shareLots, r.shareKg]);
      paintDataRow(row, i);
    });
    market.columns = [{ width: 28 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 10 }];

    const destShare = wb.addWorksheet("Share dest", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const dHeader = destShare.addRow(["Dest", "Lô", "Kg", "% lô", "% kg"]);
    styleHeader(dHeader);
    intel.destShare.rows.forEach((r, i) => {
      const row = destShare.addRow([r.label, r.lots, r.actualKg, r.shareLots, r.shareKg]);
      paintDataRow(row, i);
    });
    destShare.columns = [{ width: 12 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 10 }];

    const airShare = wb.addWorksheet("Share hãng", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const aShareHeader = airShare.addRow(["Hãng", "Lô", "Kg", "% lô", "% kg"]);
    styleHeader(aShareHeader);
    intel.airlineShare.rows.forEach((r, i) => {
      const row = airShare.addRow([r.label, r.lots, r.actualKg, r.shareLots, r.shareKg]);
      paintDataRow(row, i);
    });
    airShare.columns = [{ width: 10 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 10 }];

    const lane = wb.addWorksheet("Customer x dest", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const lHeader = lane.addRow(["Khách", "Dest", "Lô", "Kg"]);
    styleHeader(lHeader);
    intel.customerDestTop.forEach((c, i) => {
      const row = lane.addRow([c.customerLabel, c.dest, c.lots, c.actualKg]);
      paintDataRow(row, i);
    });
    lane.columns = [{ width: 28 }, { width: 8 }, { width: 8 }, { width: 12 }];

    if (intel.insights.length) {
      const tip = wb.addWorksheet("Gợi ý booking");
      tip.addRow(["Focus", intel.focusYmd]);
      tip.addRow([]);
      intel.insights.forEach((line) => tip.addRow([line]));
      tip.getColumn(1).width = 100;
    }

    if (intel.alerts.length) {
      const al = wb.addWorksheet("Cảnh báo", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      const aHeader = al.addRow(["Loại", "AWB", "Ngày", "Mức", "Nội dung"]);
      styleHeader(aHeader);
      intel.alerts.forEach((a, i) => {
        const row = al.addRow([a.kind, a.awb, a.sessionDate, a.severity, a.message]);
        paintDataRow(row, i, false);
      });
      al.columns = [
        { width: 16 },
        { width: 16 },
        { width: 12 },
        { width: 10 },
        { width: 48 },
      ];
    }
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
  intelligence?: OpsStatsIntelligence;
  filterMeta?: Record<string, string>;
}): Promise<void> {
  const wb = await buildOpsStatsWorkbook(opts);
  const buf = await wb.xlsx.writeBuffer();
  downloadXlsxBuffer(
    buf as ArrayBuffer,
    opsStatsExportFilename(opts.fromYmd, opts.toYmd)
  );
}
