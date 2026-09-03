import type { ScscH21CatalogItem, ScscH21InvoiceLine, ScscH21StampId } from "../types/scscH21Catalog";
import {
  clampScscH21Catalog,
  clampScscH21InvoiceLines,
  catalogItemFromExcelRow,
  invoiceLineFromCatalogItem,
} from "../../shared/scscH21CatalogNormalize.mjs";

const credFetch: RequestInit = { credentials: "include" };

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function errMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

export async function fetchScscH21Goods(opts?: {
  q?: string;
  activeOnly?: boolean;
}): Promise<ScscH21CatalogItem[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.activeOnly === false) params.set("activeOnly", "0");
  params.set("limit", "2000");
  const qs = params.toString();
  const res = await fetch(`/api/scsc-h21/goods?${qs}`, credFetch);
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tải được danh mục H21 SCSC"));
  const items = (body as { items?: unknown })?.items;
  return clampScscH21Catalog(items) as ScscH21CatalogItem[];
}

export async function createScscH21Goods(
  item: Partial<ScscH21CatalogItem>
): Promise<ScscH21CatalogItem> {
  const res = await fetch("/api/scsc-h21/goods", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tạo được mặt hàng"));
  return (body as { item: ScscH21CatalogItem }).item;
}

export async function updateScscH21Goods(
  id: string,
  patch: Partial<ScscH21CatalogItem>
): Promise<ScscH21CatalogItem> {
  const res = await fetch(`/api/scsc-h21/goods/${encodeURIComponent(id)}`, {
    ...credFetch,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không cập nhật được mặt hàng"));
  return (body as { item: ScscH21CatalogItem }).item;
}

export async function deleteScscH21Goods(id: string): Promise<void> {
  const res = await fetch(`/api/scsc-h21/goods/${encodeURIComponent(id)}`, {
    ...credFetch,
    method: "DELETE",
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không xóa được mặt hàng"));
}

export async function importScscH21Goods(
  items: Partial<ScscH21CatalogItem>[]
): Promise<{ created: number; updated: number }> {
  const res = await fetch("/api/scsc-h21/goods/import", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Import thất bại"));
  const b = body as { created?: number; updated?: number };
  return { created: b.created ?? 0, updated: b.updated ?? 0 };
}

export async function fetchScscH21Stamps(): Promise<ScscH21StampId[]> {
  const res = await fetch("/api/scsc-h21/stamps", credFetch);
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tải được stamp ID"));
  const items = (body as { items?: ScscH21StampId[] })?.items;
  return Array.isArray(items) ? items : [];
}

/** Parse workbook Excel (sheet đầu) → catalog items. */
export async function parseScscH21CatalogExcel(buf: ArrayBuffer): Promise<ScscH21CatalogItem[]> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? "").trim();
  });
  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let any = false;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      let v: unknown = cell.value;
      if (v && typeof v === "object" && "result" in (v as object)) {
        v = (v as { result: unknown }).result;
      }
      if (v != null && String(v).trim() !== "") any = true;
      obj[key] = v;
    });
    if (any) rows.push(obj);
  });
  return clampScscH21Catalog(rows.map((r) => catalogItemFromExcelRow(r)).filter(Boolean)) as ScscH21CatalogItem[];
}

export function pickInvoiceLinesFromCatalog(
  catalogItems: readonly ScscH21CatalogItem[]
): ScscH21InvoiceLine[] {
  return catalogItems
    .map((c) => invoiceLineFromCatalogItem(c))
    .filter((x): x is ScscH21InvoiceLine => Boolean(x));
}

export function clampInvoiceItemsForShipment(
  warehouse: unknown,
  items: unknown
): ScscH21InvoiceLine[] | undefined {
  if (String(warehouse ?? "").trim().toUpperCase() !== "SCSC") return undefined;
  const lines = clampScscH21InvoiceLines(items) as ScscH21InvoiceLine[];
  return lines.length ? lines : [];
}
