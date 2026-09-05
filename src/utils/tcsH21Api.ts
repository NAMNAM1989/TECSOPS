import type { TcsH21CatalogItem, TcsH21InvoiceLine, TcsH21StampId } from "../types/tcsH21Catalog";
import {
  clampTcsH21Catalog,
  clampTcsH21InvoiceLines,
  catalogItemFromExcelRow,
  invoiceLineFromCatalogItem,
} from "../../shared/tcsH21CatalogNormalize.mjs";

const credFetch: RequestInit = { credentials: "include" };

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function errMessage(body: unknown, fallback: string, res?: Response): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  if (res && !res.ok) {
    if (res.status === 404) return "API chưa hỗ trợ thao tác này — hãy khởi động lại server (npm run dev).";
    return `${fallback} (HTTP ${res.status})`;
  }
  return fallback;
}

export async function fetchTcsH21Goods(opts?: {
  q?: string;
  activeOnly?: boolean;
}): Promise<TcsH21CatalogItem[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.activeOnly === false) params.set("activeOnly", "0");
  params.set("limit", "2000");
  const qs = params.toString();
  const res = await fetch(`/api/tcs-h21/goods?${qs}`, credFetch);
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tải được danh mục H21 TCS"));
  const items = (body as { items?: unknown })?.items;
  return clampTcsH21Catalog(items) as TcsH21CatalogItem[];
}

export async function createTcsH21Goods(
  item: Partial<TcsH21CatalogItem>
): Promise<TcsH21CatalogItem> {
  const res = await fetch("/api/tcs-h21/goods", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tạo được mặt hàng"));
  return (body as { item: TcsH21CatalogItem }).item;
}

export async function updateTcsH21Goods(
  id: string,
  patch: Partial<TcsH21CatalogItem>
): Promise<TcsH21CatalogItem> {
  const res = await fetch(`/api/tcs-h21/goods/${encodeURIComponent(id)}`, {
    ...credFetch,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không cập nhật được mặt hàng"));
  return (body as { item: TcsH21CatalogItem }).item;
}

export async function deleteTcsH21Goods(id: string): Promise<void> {
  const res = await fetch(`/api/tcs-h21/goods/${encodeURIComponent(id)}`, {
    ...credFetch,
    method: "DELETE",
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không xóa được mặt hàng"));
}

export async function importTcsH21Goods(
  items: Partial<TcsH21CatalogItem>[]
): Promise<{ created: number; updated: number }> {
  const res = await fetch("/api/tcs-h21/goods/import", {
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

/** Xóa toàn bộ catalog TCS rồi ghi lại từ file (thay thế, không giữ bản cũ). */
export async function replaceTcsH21Goods(
  items: Partial<TcsH21CatalogItem>[]
): Promise<{ count: number }> {
  const res = await fetch("/api/tcs-h21/goods", {
    ...credFetch,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Thay thế catalog thất bại"));
  const b = body as { count?: number; items?: unknown[] };
  return { count: b.count ?? (Array.isArray(b.items) ? b.items.length : 0) };
}

export async function fetchTcsH21Stamps(opts?: {
  includeSeal?: boolean;
}): Promise<TcsH21StampId[]> {
  const qs = opts?.includeSeal ? "?includeSeal=1" : "";
  const res = await fetch(`/api/tcs-h21/stamps${qs}`, credFetch);
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tải được shipper tờ khai", res));
  const items = (body as { items?: TcsH21StampId[] })?.items;
  return Array.isArray(items) ? items : [];
}

export async function fetchTcsH21Stamp(id: string): Promise<TcsH21StampId> {
  const res = await fetch(`/api/tcs-h21/stamps/${encodeURIComponent(id)}`, credFetch);
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tải được shipper tờ khai", res));
  return (body as { item: TcsH21StampId }).item;
}

export async function createTcsH21Stamp(
  item: Partial<TcsH21StampId>
): Promise<TcsH21StampId> {
  const res = await fetch("/api/tcs-h21/stamps", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không tạo được shipper tờ khai", res));
  return (body as { item: TcsH21StampId }).item;
}

export async function updateTcsH21Stamp(
  id: string,
  patch: Partial<TcsH21StampId>
): Promise<TcsH21StampId> {
  const res = await fetch(`/api/tcs-h21/stamps/${encodeURIComponent(id)}`, {
    ...credFetch,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không cập nhật được shipper tờ khai", res));
  return (body as { item: TcsH21StampId }).item;
}

export async function deleteTcsH21Stamp(id: string): Promise<void> {
  const res = await fetch(`/api/tcs-h21/stamps/${encodeURIComponent(id)}`, {
    ...credFetch,
    method: "DELETE",
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, "Không xóa được shipper tờ khai", res));
}

/** Parse workbook Excel (sheet đầu) → catalog items. */
export async function parseTcsH21CatalogExcel(buf: ArrayBuffer): Promise<TcsH21CatalogItem[]> {
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
  return clampTcsH21Catalog(rows.map((r) => catalogItemFromExcelRow(r)).filter(Boolean)) as TcsH21CatalogItem[];
}

export function pickInvoiceLinesFromCatalog(
  catalogItems: readonly TcsH21CatalogItem[]
): TcsH21InvoiceLine[] {
  return catalogItems
    .map((c) => invoiceLineFromCatalogItem(c))
    .filter((x): x is TcsH21InvoiceLine => Boolean(x));
}

export function clampInvoiceItemsForShipment(
  warehouse: unknown,
  items: unknown
): TcsH21InvoiceLine[] | undefined {
  if (String(warehouse ?? "").trim().toUpperCase() !== "TCS") return undefined;
  const lines = clampTcsH21InvoiceLines(items) as TcsH21InvoiceLine[];
  return lines.length ? lines : [];
}
