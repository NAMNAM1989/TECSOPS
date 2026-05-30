import type { InvoiceCatalogItem } from "../types/invoiceItem";
import {
  clampInvoiceCatalogItem,
  emptyInvoiceCatalogItem,
  newInvoiceCatalogItemId,
} from "./invoiceCatalogCore";

function cellNumber(cell: { value?: unknown } | undefined): number {
  const v = cell?.value;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null) {
    if ("result" in v && typeof (v as { result: unknown }).result === "number") {
      return (v as { result: number }).result;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cellText(cell: { value?: unknown } | undefined): string {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null) {
    if ("richText" in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("").trim();
    }
    if ("text" in v) return String((v as { text: unknown }).text).trim();
    if ("result" in v && typeof (v as { result: unknown }).result === "string") {
      return (v as { result: string }).result.trim();
    }
  }
  return String(v).trim();
}

/** Khóa so khớp trùng mặt hàng — theo mô tả (không phân biệt hoa thường, gom khoảng trắng). */
export function catalogItemDedupeKey(description: string): string {
  return description.trim().replace(/\s+/g, " ").toLowerCase();
}

export function findDuplicateCatalogDescriptions(
  items: readonly Pick<InvoiceCatalogItem, "description">[]
): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const it of items) {
    const key = catalogItemDedupeKey(it.description);
    if (!key) continue;
    if (seen.has(key)) {
      if (!dupes.includes(it.description.trim())) dupes.push(it.description.trim());
    } else {
      seen.add(key);
    }
  }
  return dupes;
}

export type CatalogImportMergeResult = {
  items: InvoiceCatalogItem[];
  added: number;
  skippedDuplicate: number;
  skippedEmpty: number;
  truncated: boolean;
};

const MAX_ITEMS = 500;

/** Gộp danh mục nền (server/static) vào draft khi editor mở trước lúc JSON tải xong. */
export function mergeCatalogDraftWithBase(
  prev: readonly InvoiceCatalogItem[],
  baseItems: readonly InvoiceCatalogItem[]
): InvoiceCatalogItem[] {
  if (baseItems.length === 0) return [...prev];

  const pending = prev.filter((it) => !it.description.trim());
  const established = prev.filter((it) => it.description.trim());

  if (established.length > 0) {
    return [...prev];
  }

  const base = baseItems.map((it) => clampInvoiceCatalogItem(it));
  if (pending.length === 0) return base;

  const seen = new Set(base.map((it) => catalogItemDedupeKey(it.description)));
  const extraPending = pending.filter((it) => {
    const key = catalogItemDedupeKey(it.description);
    return !key || !seen.has(key);
  });
  return [...extraPending, ...base];
}

/** Gộp mặt hàng từ Excel vào danh mục hiện có — bỏ qua mô tả trùng. */
export function mergeImportedCatalogItems(
  existing: readonly InvoiceCatalogItem[],
  imported: readonly InvoiceCatalogItem[],
  maxItems = MAX_ITEMS
): CatalogImportMergeResult {
  const keys = new Set(existing.map((it) => catalogItemDedupeKey(it.description)));
  const merged: InvoiceCatalogItem[] = [...existing.map((it) => clampInvoiceCatalogItem(it))];
  let added = 0;
  let skippedDuplicate = 0;
  let skippedEmpty = 0;

  for (const raw of imported) {
    if (merged.length >= maxItems) break;
    const item = clampInvoiceCatalogItem({
      ...emptyInvoiceCatalogItem(),
      ...raw,
      id: newInvoiceCatalogItemId(),
    });
    const key = catalogItemDedupeKey(item.description);
    if (!key) {
      skippedEmpty += 1;
      continue;
    }
    if (keys.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    keys.add(key);
    merged.push(item);
    added += 1;
  }

  const truncated = merged.length >= maxItems && imported.length > added + skippedDuplicate + skippedEmpty;

  return {
    items: merged.slice(0, maxItems),
    added,
    skippedDuplicate,
    skippedEmpty,
    truncated,
  };
}

export type CatalogSaveValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateCatalogItemsForSave(
  items: readonly InvoiceCatalogItem[]
): CatalogSaveValidation {
  const emptyCount = items.filter((it) => !it.description.trim()).length;
  if (emptyCount > 0) {
    return {
      ok: false,
      message: `Còn ${emptyCount} mặt hàng chưa có mô tả — điền mô tả hoặc xóa dòng trống trước khi lưu.`,
    };
  }
  const dupes = findDuplicateCatalogDescriptions(items);
  if (dupes.length > 0) {
    const sample = dupes.slice(0, 3).join(" · ");
    return {
      ok: false,
      message: `Mô tả hàng bị trùng (${dupes.length}): ${sample}${dupes.length > 3 ? "…" : ""}`,
    };
  }
  return { ok: true };
}

type ExcelCell = { value?: unknown };
type ExcelRow = { getCell: (col: number | string) => ExcelCell };
type ExcelWorksheet = {
  rowCount: number;
  getRow: (n: number) => ExcelRow;
};

/** Đọc sheet đầu tiên — cùng layout `data_invoice.xlsx` (A=LOẠI, B=mô tả, …). */
export function parseInvoiceCatalogWorksheet(ws: ExcelWorksheet & {
  eachRow?: (
    cb: (row: ExcelRow, rowNumber: number) => void,
    opts?: { includeEmpty?: boolean }
  ) => void;
}): InvoiceCatalogItem[] {
  const items: InvoiceCatalogItem[] = [];

  const readRow = (row: ExcelRow) => {
    const description = cellText(row.getCell("B"));
    if (!description) return null;
    return clampInvoiceCatalogItem({
      id: newInvoiceCatalogItemId(),
      category: cellText(row.getCell("A")),
      description,
      hsCode: cellText(row.getCell("C")),
      origin: cellText(row.getCell("D")) || "VN",
      sampleQuantity: cellNumber(row.getCell("E")),
      unit: cellText(row.getCell("F")) || "PCE",
      unitPriceUsd: cellNumber(row.getCell("G")),
      kgPerUnit: cellNumber(row.getCell("I")),
    });
  };

  if (typeof ws.eachRow === "function") {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < 2) return;
      const item = readRow(row);
      if (item) items.push(item);
    });
    return items;
  }

  for (let r = 2; r <= ws.rowCount; r++) {
    const item = readRow(ws.getRow(r));
    if (item) items.push(item);
  }
  return items;
}

/** Parse file Excel (.xlsx) từ browser hoặc Node buffer. */
export async function parseInvoiceCatalogExcelBuffer(
  buffer: ArrayBuffer
): Promise<InvoiceCatalogItem[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File Excel không có sheet nào.");
  return parseInvoiceCatalogWorksheet(ws as ExcelWorksheet);
}
