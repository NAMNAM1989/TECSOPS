import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  allocateNextCustomerCode,
  inferPrefixFromCustomerCode,
  isValidCustomerPrefix,
  normalizeCustomerPrefix,
  normalizeCustomerShortCode,
} from "./customerCodeOps";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";
import { normalizeAgentCode } from "./customerProfileInputFormat";
import { normalizeCustomerNameInput } from "./customerShipmentPatch";

/** Cột đúng mẫu `customs_ops.xlsx` / sheet Import Customers. */
export const CUSTOMS_OPS_HEADERS = [
  "Prefix",
  "Customer Code",
  "Customer Name",
  "Short Code",
] as const;

export const CUSTOMS_OPS_TEMPLATE_URL = "/templates/customer/customs_ops.xlsx";

export type CustomsOpsImportRow = {
  rowNumber: number;
  prefix: string;
  code: string;
  name: string;
  shortCode: string;
};

export type CustomsOpsImportResult = {
  customers: CustomerDirectoryEntry[];
  created: number;
  updated: number;
  skipped: number;
  errors: { rowNumber: number; message: string }[];
};

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v).trim();
  }
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("").trim();
    if (o.result != null) return String(o.result).trim();
  }
  return "";
}

function headerKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapHeaderIndex(headers: string[]): Record<"prefix" | "code" | "name" | "shortCode", number> {
  const map: Partial<Record<"prefix" | "code" | "name" | "shortCode", number>> = {};
  headers.forEach((h, i) => {
    const k = headerKey(h);
    if (k === "prefix") map.prefix = i;
    else if (k === "customer code" || k === "code") map.code = i;
    else if (k === "customer name" || k === "name") map.name = i;
    else if (k === "short code" || k === "shortcode") map.shortCode = i;
  });
  if (map.prefix == null || map.name == null) {
    throw new Error(
      "File không đúng mẫu customs_ops — cần cột Prefix, Customer Code, Customer Name, Short Code."
    );
  }
  if (map.code == null) map.code = -1;
  if (map.shortCode == null) map.shortCode = -1;
  return map as Record<"prefix" | "code" | "name" | "shortCode", number>;
}

/** Đọc sheet Import Customers từ workbook ExcelJS. */
export async function parseCustomsOpsWorkbook(buffer: ArrayBuffer): Promise<CustomsOpsImportRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws =
    wb.worksheets.find((s) => headerKey(s.name).includes("import customer")) ??
    wb.worksheets[0];
  if (!ws) throw new Error("File Excel không có sheet dữ liệu.");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cellText(cell.value);
  });
  const idx = mapHeaderIndex(headers);

  const rows: CustomsOpsImportRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (colIdx: number) =>
      colIdx >= 0 ? cellText(row.getCell(colIdx + 1).value) : "";
    const prefix = normalizeCustomerPrefix(get(idx.prefix));
    const code = normalizeAgentCode(get(idx.code));
    const name = normalizeCustomerNameInput(get(idx.name));
    const shortCode = normalizeCustomerShortCode(get(idx.shortCode));
    if (!prefix && !code && !name && !shortCode) return;
    rows.push({ rowNumber, prefix, code, name, shortCode });
  });
  return rows;
}

function newCustomerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Đồng bộ danh bạ theo quy tắc customs_ops:
 * - Code đã có → cập nhật Name + Short Code (Prefix phải khớp nếu có)
 * - Code trống → tạo mới, sinh mã từ Prefix
 * - Code mới chưa có → tạo với mã đó
 */
export function applyCustomsOpsImport(
  existing: readonly CustomerDirectoryEntry[],
  rows: readonly CustomsOpsImportRow[]
): CustomsOpsImportResult {
  const customers = existing.map((e) => ({ ...e }));
  const byCode = new Map(customers.map((e) => [e.code.trim().toLowerCase(), e]));
  const errors: CustomsOpsImportResult["errors"] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.name) {
      errors.push({ rowNumber: row.rowNumber, message: "Customer Name bắt buộc." });
      skipped += 1;
      continue;
    }
    const name = normalizeCustomerNameInput(row.name);
    if (!name) {
      errors.push({ rowNumber: row.rowNumber, message: "Customer Name bắt buộc." });
      skipped += 1;
      continue;
    }

    if (row.code) {
      const hit = byCode.get(row.code.toLowerCase());
      if (hit) {
        const existingPrefix =
          normalizeCustomerPrefix(hit.prefix ?? "") || inferPrefixFromCustomerCode(hit.code);
        if (row.prefix && existingPrefix && row.prefix !== existingPrefix) {
          errors.push({
            rowNumber: row.rowNumber,
            message: `Prefix «${row.prefix}» không khớp prefix hiện tại «${existingPrefix}» của mã ${hit.code}.`,
          });
          skipped += 1;
          continue;
        }
        hit.name = name;
        if (row.shortCode) hit.shortCode = row.shortCode;
        if (!hit.prefix && (row.prefix || existingPrefix)) {
          hit.prefix = row.prefix || existingPrefix;
        }
        updated += 1;
        continue;
      }

      if (!row.prefix) {
        errors.push({
          rowNumber: row.rowNumber,
          message: "Tạo mới cần Prefix (2–5 chữ A–Z).",
        });
        skipped += 1;
        continue;
      }
      if (!isValidCustomerPrefix(row.prefix)) {
        errors.push({ rowNumber: row.rowNumber, message: "Prefix phải gồm 2–5 chữ A–Z." });
        skipped += 1;
        continue;
      }
      if (!row.code.startsWith(row.prefix)) {
        errors.push({
          rowNumber: row.rowNumber,
          message: `Customer Code «${row.code}» phải bắt đầu bằng Prefix «${row.prefix}».`,
        });
        skipped += 1;
        continue;
      }

      const createdRow = scaffoldNewCustomer(newCustomerId());
      createdRow.prefix = row.prefix;
      createdRow.code = row.code;
      createdRow.name = name;
      createdRow.shortCode = row.shortCode || undefined;
      customers.push(createdRow);
      byCode.set(row.code.toLowerCase(), createdRow);
      created += 1;
      continue;
    }

    // Code trống → tạo mới + sinh mã
    if (!isValidCustomerPrefix(row.prefix)) {
      errors.push({
        rowNumber: row.rowNumber,
        message: "Bỏ trống Customer Code thì Prefix (2–5 chữ A–Z) là bắt buộc.",
      });
      skipped += 1;
      continue;
    }
    const nextCode = allocateNextCustomerCode(
      row.prefix,
      customers.map((c) => c.code)
    );
    const createdRow = scaffoldNewCustomer(newCustomerId());
    createdRow.prefix = row.prefix;
    createdRow.code = nextCode;
    createdRow.name = name;
    createdRow.shortCode = row.shortCode || undefined;
    customers.push(createdRow);
    byCode.set(nextCode.toLowerCase(), createdRow);
    created += 1;
  }

  return { customers, created, updated, skipped, errors };
}

/** Xuất danh bạ đúng 4 cột mẫu customs_ops. */
export async function buildCustomsOpsWorkbook(customers: readonly CustomerDirectoryEntry[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import Customers");
  ws.addRow([...CUSTOMS_OPS_HEADERS]);
  for (const c of customers) {
    const prefix =
      normalizeCustomerPrefix(c.prefix ?? "") || inferPrefixFromCustomerCode(c.code);
    ws.addRow([
      prefix,
      normalizeAgentCode(c.code),
      c.name.trim(),
      normalizeCustomerShortCode(c.shortCode ?? ""),
    ]);
  }
  ws.getRow(1).font = { bold: true };
  ws.columns = [{ width: 10 }, { width: 16 }, { width: 40 }, { width: 12 }];
  return wb;
}

export async function downloadCustomsOpsExport(customers: readonly CustomerDirectoryEntry[]) {
  const wb = await buildCustomsOpsWorkbook(customers);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `customs-ops-customers-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
