/** Giữ đồng bộ với src/utils/invoiceExcelLayout.ts */

export function fmtKg(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const DESCRIPTION_WRAP_TARGET_LINES = 4;
export const HEADER_BLOCK_WRAP_TARGET_LINES = 2;
export const INVOICE_SHEET_COL_COUNT = 10;
export const PRE_HEADER_LEFT_MERGE_END_COL = 4;
export const PRE_HEADER_META_LABEL_COL = 5;
export const PRE_HEADER_META_VALUE_COL = 6;
export const PRE_HEADER_META_VALUE_MERGE_END_COL = 10;

export const DESCRIPTION_COL_WIDTH = 37;
export const INVOICE_FIXED_COLUMN_WIDTHS = [
  4.5,
  DESCRIPTION_COL_WIDTH,
  10,
  7,
  12,
  6.5,
  13,
  11.5,
  9.01,
  12,
];

export const DESCRIPTION_CELL_ALIGNMENT = {
  vertical: "top",
  horizontal: "left",
  wrapText: true,
};

export const PRE_HEADER_TEXT_ALIGNMENT = {
  vertical: "top",
  horizontal: "left",
  wrapText: true,
};

export function getInvoiceFixedColumnWidths() {
  return [...INVOICE_FIXED_COLUMN_WIDTHS];
}

export const TABLE_DATA_COL_START_INDEX = 2;
export const TABLE_DATA_COL_END_INDEX = 9;
export const TABLE_DATA_COLUMN_LIMITS = {
  min: 10,
  max: 13,
  default: 11.5,
};

export const INVOICE_COLUMN_LIMITS = [
  { min: 3.5, max: 6, default: 4.5 },
  { min: 24, max: 46, default: 30 },
  { ...TABLE_DATA_COLUMN_LIMITS },
  { ...TABLE_DATA_COLUMN_LIMITS },
  { ...TABLE_DATA_COLUMN_LIMITS },
  { ...TABLE_DATA_COLUMN_LIMITS },
  { ...TABLE_DATA_COLUMN_LIMITS },
  { ...TABLE_DATA_COLUMN_LIMITS },
  { ...TABLE_DATA_COLUMN_LIMITS },
  { ...TABLE_DATA_COLUMN_LIMITS },
];

const MIN_ROW_HEIGHT = 18;
const ROW_PADDING_PT = 10;
const ROW_HEIGHT_SAFETY_PT = 7;
const CHARS_PER_COL_UNIT = 0.82;
const FONT_SIZE_DEFAULT = 12;
export const TABLE_HEADER_MIN_HEIGHT = 30;
export const TABLE_HEADER_MAX_HEIGHT = 48;
const TABLE_HEADER_EXTRA_PADDING_PT = 4;
export const GOODS_ROW_MIN_HEIGHT = 48;
export const GOODS_ROW_MAX_HEIGHT = 96;
export const GOODS_ROW_EXTRA_PADDING_PT = 4;

export function displayLength(text) {
  let width = 0;
  for (const ch of String(text ?? "")) {
    width += /[\u0000-\u007F]/.test(ch) ? 1 : 1.18;
  }
  return width;
}

export function longestLineLength(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  if (lines.length === 0) return 0;
  return Math.max(...lines.map((line) => displayLength(line)));
}

export function cellTextForWidth(value) {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "formula" in value) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    const abs = Math.abs(value);
    if (abs >= 1000 || !Number.isInteger(value)) {
      return value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return String(value);
  }
  return String(value);
}

export function widthForTextInLines(text, targetLines) {
  if (targetLines <= 0) return 0;
  const paragraphs = String(text ?? "").split(/\r?\n/);
  let maxWidth = 0;
  for (const paragraph of paragraphs) {
    const len = displayLength(paragraph);
    if (len === 0) continue;
    maxWidth = Math.max(maxWidth, len / targetLines / CHARS_PER_COL_UNIT + 2);
  }
  return maxWidth;
}

export function countWrappedLines(text, columnWidth) {
  const charsPerLine = Math.max(4, Math.floor(columnWidth * CHARS_PER_COL_UNIT));
  const paragraphs = String(text ?? "").split(/\r?\n/);
  let lines = 0;
  for (const paragraph of paragraphs) {
    const len = displayLength(paragraph);
    lines += Math.max(1, Math.ceil(len / charsPerLine));
  }
  return lines;
}

export function rowHeightForLineCount(lineCount, fontSize = FONT_SIZE_DEFAULT) {
  const lineHeight = fontSize * 1.2 + 2;
  return Math.max(
    MIN_ROW_HEIGHT,
    Math.ceil(lineCount * lineHeight + ROW_PADDING_PT + ROW_HEIGHT_SAFETY_PT),
  );
}

export function rowHeightForWrappedText(text, columnWidth, fontSize = FONT_SIZE_DEFAULT) {
  return rowHeightForLineCount(countWrappedLines(text, columnWidth), fontSize);
}

export function estimateWrappedRowHeight(text, columnWidth) {
  return rowHeightForWrappedText(text, columnWidth);
}

export function estimateGoodsDescriptionRowHeight(text, columnWidth) {
  return rowHeightForWrappedText(text, columnWidth);
}

function columnsToMeasureForRowHeight(options) {
  const mergedKeys = Object.keys(options.mergedColWidths ?? {}).map(Number);
  if (mergedKeys.length > 0) {
    return [...new Set([...mergedKeys, ...(options.measureCols ?? [])])].sort((a, b) => a - b);
  }
  const startCol = options.startCol ?? 1;
  const endCol = options.endCol ?? INVOICE_SHEET_COL_COUNT;
  const cols = [];
  for (let col = startCol; col <= endCol; col++) cols.push(col);
  return cols;
}

export function autoFitInvoiceRowHeightFromSpecs(ws, row, specs, options = {}) {
  let height = options.minHeight ?? MIN_ROW_HEIGHT;
  const extra = options.extraPadding ?? 0;

  for (const spec of specs) {
    const text = cellTextForWidth(ws.getCell(row, spec.col).value);
    if (!text) continue;
    const fontSize = spec.fontSize ?? ws.getCell(row, spec.col).font?.size ?? FONT_SIZE_DEFAULT;
    height = Math.max(height, rowHeightForWrappedText(text, spec.width, fontSize) + extra);
  }

  if (options.maxHeight != null) height = Math.min(height, options.maxHeight);
  ws.getRow(row).height = height;
  return height;
}

export function autoFitInvoiceRowHeight(ws, row, widths, options = {}) {
  let height = options.minHeight ?? MIN_ROW_HEIGHT;
  const extra = options.extraPadding ?? 0;

  for (const col of columnsToMeasureForRowHeight(options)) {
    const cell = ws.getCell(row, col);
    const text = cellTextForWidth(cell.value);
    if (!text) continue;

    const colWidth = options.mergedColWidths?.[col] ?? widths[col - 1] ?? 10;
    const fontSize = cell.font?.size ?? FONT_SIZE_DEFAULT;
    height = Math.max(height, rowHeightForWrappedText(text, colWidth, fontSize) + extra);
  }

  if (options.maxHeight != null) height = Math.min(height, options.maxHeight);
  ws.getRow(row).height = height;
  return height;
}

function buildGoodsRowHeightSpecs(ws, row, widths) {
  const specs = [];
  const desc = cellTextForWidth(ws.getCell(row, 2).value);
  if (desc) specs.push({ col: 2, width: DESCRIPTION_COL_WIDTH });

  const hs = cellTextForWidth(ws.getCell(row, 3).value);
  if (hs && countWrappedLines(hs, widths[2]) > 1) {
    specs.push({ col: 3, width: widths[2] });
  }

  const unit = cellTextForWidth(ws.getCell(row, 6).value);
  if (unit && countWrappedLines(unit, widths[5]) > 1) {
    specs.push({ col: 6, width: widths[5] });
  }

  return specs;
}

function buildShipperRowHeightSpecs(ws, row, widths, leftSpan, metaValueSpan) {
  const specs = [];
  if (cellTextForWidth(ws.getCell(row, 2).value)) {
    specs.push({ col: 2, width: leftSpan });
  }
  if (cellTextForWidth(ws.getCell(row, PRE_HEADER_META_LABEL_COL).value)) {
    specs.push({ col: PRE_HEADER_META_LABEL_COL, width: widths[4] });
  }
  if (cellTextForWidth(ws.getCell(row, PRE_HEADER_META_VALUE_COL).value)) {
    specs.push({ col: PRE_HEADER_META_VALUE_COL, width: metaValueSpan });
  }
  return specs;
}

function sampleWidthForColumn(sample, columnIndex) {
  if (columnIndex === DESCRIPTION_COL_INDEX) {
    const forTargetLines = widthForTextInLines(sample, DESCRIPTION_WRAP_TARGET_LINES);
    const forHeaderBlock = widthForTextInLines(sample, HEADER_BLOCK_WRAP_TARGET_LINES);
    const singleLine = longestLineLength(sample) * 1.05 + 1.5;
    return Math.max(forTargetLines, forHeaderBlock, singleLine);
  }
  if (
    columnIndex === PRE_HEADER_META_LABEL_COL - 1 ||
    columnIndex === PRE_HEADER_META_VALUE_COL - 1
  ) {
    return Math.max(longestLineLength(sample) * 1.05 + 1.5, widthForTextInLines(sample, 1));
  }
  return longestLineLength(sample) * 1.05 + 1.5;
}

function sumColumnWidths(widths, startCol, endCol) {
  let sum = 0;
  for (let col = startCol; col <= endCol; col++) {
    sum += widths[col - 1] ?? 0;
  }
  return sum;
}

function mergeRowRange(ws, row, startCol, endCol) {
  if (endCol <= startCol) return;
  ws.mergeCells(row, startCol, row, endCol);
}

function applyPreHeaderTextAlignment(ws, row, col = DESCRIPTION_COL_INDEX + 1) {
  ws.getCell(row, col).alignment = { ...PRE_HEADER_TEXT_ALIGNMENT };
}

function appendHeaderBlockSamples(samples, payload) {
  samples[DESCRIPTION_COL_INDEX].push(
    "NONCOMMERCIAL INVOICE & PACKING LIST",
    ...(payload.shipper?.lines ?? []),
    "THE CNEE:",
  );

  samples[PRE_HEADER_META_LABEL_COL - 1].push(
    "Invoice No.:",
    "Date:",
    "Flight:",
    "NO PAYMENT",
  );
  samples[PRE_HEADER_META_VALUE_COL - 1].push(
    String(payload.meta?.invoiceNo ?? ""),
    String(payload.meta?.dateStr ?? ""),
    String(payload.meta?.flightLine ?? ""),
  );
}

export function computeAutoFitColumnWidths(columnSamples, limits = INVOICE_COLUMN_LIMITS) {
  return columnSamples.map((samples, index) => {
    const lim = limits[index] ?? limits[0];
    let maxWidth = lim.default;
    for (const sample of samples) {
      maxWidth = Math.max(maxWidth, sampleWidthForColumn(sample, index));
    }
    const width = Math.min(lim.max, Math.max(lim.min, maxWidth));
    return Math.round(width * 10) / 10;
  });
}

export function balanceTableDataColumnWidths(widths) {
  const next = [...widths];
  let peak = TABLE_DATA_COLUMN_LIMITS.min;
  for (let index = TABLE_DATA_COL_START_INDEX; index <= TABLE_DATA_COL_END_INDEX; index++) {
    peak = Math.max(peak, next[index] ?? TABLE_DATA_COLUMN_LIMITS.default);
  }
  const balanced =
    Math.round(
      Math.min(
        TABLE_DATA_COLUMN_LIMITS.max,
        Math.max(TABLE_DATA_COLUMN_LIMITS.min, peak),
      ) * 10,
    ) / 10;
  for (let index = TABLE_DATA_COL_START_INDEX; index <= TABLE_DATA_COL_END_INDEX; index++) {
    next[index] = balanced;
  }
  return next;
}

export function estimateTableHeaderRowHeight(columnHeaders, widths) {
  let height = TABLE_HEADER_MIN_HEIGHT;
  for (let index = 0; index < columnHeaders.length; index++) {
    const header = columnHeaders[index] ?? "";
    const cellHeight = estimateWrappedRowHeight(header, widths[index] ?? widths[1]);
    const padding =
      header.includes("\n") || index === 6 || index === 7 || index === 8
        ? TABLE_HEADER_EXTRA_PADDING_PT
        : 4;
    height = Math.max(height, cellHeight + padding);
  }
  return Math.min(TABLE_HEADER_MAX_HEIGHT, height);
}

export function buildInvoiceColumnSamples(payload, columnHeaders) {
  const samples = Array.from({ length: columnHeaders.length }, () => []);

  appendHeaderBlockSamples(samples, payload);

  columnHeaders.forEach((header, index) => {
    samples[index].push(header);
  });

  for (const line of payload.cnee?.lines ?? []) {
    samples[1].push(String(line ?? ""));
  }

  for (const line of payload.lines ?? []) {
    samples[0].push(String(line.no ?? ""));
    samples[1].push(String(line.description ?? ""));
    samples[2].push(String(line.hsCode ?? ""));
    samples[3].push(String(line.origin ?? ""));
    samples[4].push(String(line.quantity ?? ""));
    samples[5].push(String(line.unit ?? ""));
    samples[6].push(cellTextForWidth(line.unitPriceUsd));
    samples[7].push(
      cellTextForWidth(Number(line.quantity ?? 0) * Number(line.unitPriceUsd ?? 0)),
    );
    samples[8].push(cellTextForWidth(line.kgPerUnit));
    samples[9].push(
      cellTextForWidth(fmtKg(Number(line.quantity ?? 0) * Number(line.kgPerUnit ?? 0))),
    );
  }

  samples[1].push("TOTAL");
  samples[1].push(
    payload.footer?.cartons > 0
      ? `1.   Total carton: ${payload.footer.cartons} CTNS`
      : "1.   Total carton:",
  );
  samples[1].push(
    payload.footer?.grossKg > 0
      ? `2.   Total gross weight: ${fmtKg(payload.footer.grossKg)} KGM`
      : "2.   Total gross weight:",
  );

  return samples;
}

function applyPreHeaderBlockLayout(ws, ctx, widths) {
  const leftSpan = sumColumnWidths(widths, 2, PRE_HEADER_LEFT_MERGE_END_COL);
  const metaValueSpan = sumColumnWidths(
    widths,
    PRE_HEADER_META_VALUE_COL,
    PRE_HEADER_META_VALUE_MERGE_END_COL,
  );
  const titleSpan = sumColumnWidths(widths, 2, INVOICE_SHEET_COL_COUNT);
  const footerSpan = sumColumnWidths(widths, 2, INVOICE_SHEET_COL_COUNT);

  const title = cellTextForWidth(ws.getCell(ctx.titleRow, 2).value);
  if (title) {
    mergeRowRange(ws, ctx.titleRow, 2, INVOICE_SHEET_COL_COUNT);
    ws.getCell(ctx.titleRow, 2).alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    autoFitInvoiceRowHeightFromSpecs(
      ws,
      ctx.titleRow,
      [{ col: 2, width: titleSpan, fontSize: 18 }],
      { minHeight: 28, maxHeight: 36 },
    );
  }

  for (let row = ctx.shipperBlockFirstRow; row <= ctx.shipperBlockLastRow; row++) {
    const leftText = cellTextForWidth(ws.getCell(row, 2).value);
    if (leftText) {
      mergeRowRange(ws, row, 2, PRE_HEADER_LEFT_MERGE_END_COL);
      applyPreHeaderTextAlignment(ws, row);
    }

    const labelText = cellTextForWidth(ws.getCell(row, PRE_HEADER_META_LABEL_COL).value);
    if (labelText) {
      ws.getCell(row, PRE_HEADER_META_LABEL_COL).alignment = {
        vertical: "top",
        horizontal: "left",
        wrapText: true,
      };
    }

    const metaValue = cellTextForWidth(ws.getCell(row, PRE_HEADER_META_VALUE_COL).value);
    if (metaValue) {
      mergeRowRange(
        ws,
        row,
        PRE_HEADER_META_VALUE_COL,
        PRE_HEADER_META_VALUE_MERGE_END_COL,
      );
      ws.getCell(row, PRE_HEADER_META_VALUE_COL).alignment = {
        vertical: "top",
        horizontal: "left",
        wrapText: true,
      };
    }

    autoFitInvoiceRowHeightFromSpecs(
      ws,
      row,
      buildShipperRowHeightSpecs(ws, row, widths, leftSpan, metaValueSpan),
    );
  }

  mergeRowRange(ws, ctx.cneeLabelRow, 2, PRE_HEADER_LEFT_MERGE_END_COL);
  applyPreHeaderTextAlignment(ws, ctx.cneeLabelRow);
  autoFitInvoiceRowHeightFromSpecs(ws, ctx.cneeLabelRow, [{ col: 2, width: leftSpan }]);

  for (let row = ctx.cneeFirstRow; row <= ctx.cneeLastRow; row++) {
    mergeRowRange(ws, row, 2, PRE_HEADER_LEFT_MERGE_END_COL);
    applyPreHeaderTextAlignment(ws, row);
    autoFitInvoiceRowHeightFromSpecs(ws, row, [{ col: 2, width: leftSpan }]);
  }

  return footerSpan;
}

function applyGoodsRowWrap(ws, row) {
  ws.getCell(row, 2).alignment = { ...DESCRIPTION_CELL_ALIGNMENT };
  for (let col = 3; col <= INVOICE_SHEET_COL_COUNT; col++) {
    const cell = ws.getCell(row, col);
    if (!cellTextForWidth(cell.value)) continue;
    cell.alignment = {
      vertical: "middle",
      horizontal: col >= 7 ? "right" : "center",
      wrapText: true,
    };
  }
}

export function applyInvoiceExcelLayout(ws, ctx) {
  const widths = getInvoiceFixedColumnWidths();

  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });

  const footerSpan = applyPreHeaderBlockLayout(ws, ctx, widths);

  const headerHeight = estimateTableHeaderRowHeight(ctx.columnHeaders, widths);
  ws.getRow(ctx.headerRow).height = headerHeight;
  for (let col = 1; col <= INVOICE_SHEET_COL_COUNT; col++) {
    const cell = ws.getCell(ctx.headerRow, col);
    if (cell.value == null || cell.value === "") continue;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }

  if (ctx.goodsLastRow >= ctx.goodsFirstRow) {
    for (let row = ctx.goodsFirstRow; row <= ctx.goodsLastRow; row++) {
      applyGoodsRowWrap(ws, row);
      autoFitInvoiceRowHeightFromSpecs(ws, row, buildGoodsRowHeightSpecs(ws, row, widths), {
        minHeight: GOODS_ROW_MIN_HEIGHT,
        maxHeight: GOODS_ROW_MAX_HEIGHT,
        extraPadding: GOODS_ROW_EXTRA_PADDING_PT,
      });
    }
  }

  const totalRow = ctx.footerFirstRow - 1;
  if (totalRow > ctx.goodsLastRow) {
    ws.getCell(totalRow, 2).alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
    autoFitInvoiceRowHeightFromSpecs(ws, totalRow, [
      { col: 2, width: DESCRIPTION_COL_WIDTH },
    ]);
  }

  for (let row = ctx.footerFirstRow; row <= ctx.footerLastRow; row++) {
    mergeRowRange(ws, row, 2, INVOICE_SHEET_COL_COUNT);
    applyPreHeaderTextAlignment(ws, row);
    autoFitInvoiceRowHeightFromSpecs(ws, row, [{ col: 2, width: footerSpan }]);
  }
}
