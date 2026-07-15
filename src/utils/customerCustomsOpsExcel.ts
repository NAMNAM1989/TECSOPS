import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  formatDefaultRate,
  normalizeCustomerType,
  parseDefaultRate,
} from "./customerAccountFields";
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

/** Cột đúng mẫu Import Customers (10 cột). */
export const CUSTOMS_OPS_HEADERS = [
  "Prefix",
  "Customer Code",
  "Customer Name",
  "Short Code",
  "Tax Code",
  "Address",
  "Email",
  "Phone",
  "Default Rate",
  "Customer Type",
] as const;

export const CUSTOMS_OPS_TEMPLATE_URL = "/templates/customer/customs_ops.xlsx";

export type CustomsOpsImportRow = {
  rowNumber: number;
  prefix: string;
  code: string;
  name: string;
  shortCode: string;
  taxCode: string;
  address: string;
  email: string;
  phone: string;
  defaultRate: number | null;
  customerType: string;
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

type ColKey =
  | "prefix"
  | "code"
  | "name"
  | "shortCode"
  | "taxCode"
  | "address"
  | "email"
  | "phone"
  | "defaultRate"
  | "customerType";

function mapHeaderIndex(headers: string[]): Record<ColKey, number> {
  const map: Partial<Record<ColKey, number>> = {};
  headers.forEach((h, i) => {
    const k = headerKey(h);
    if (k === "prefix") map.prefix = i;
    else if (k === "customer code" || k === "code") map.code = i;
    else if (k === "customer name" || k === "name") map.name = i;
    else if (k === "short code" || k === "shortcode") map.shortCode = i;
    else if (k === "tax code" || k === "taxcode" || k === "mst") map.taxCode = i;
    else if (k === "address" || k === "dia chi") map.address = i;
    else if (k === "email") map.email = i;
    else if (k === "phone" || k === "sdt" || k === "tel") map.phone = i;
    else if (k === "default rate" || k === "rate" || k === "don gia") map.defaultRate = i;
    else if (k === "customer type" || k === "type" || k === "loai") map.customerType = i;
  });
  if (map.prefix == null || map.name == null) {
    throw new Error(
      "File không đúng mẫu — cần cột Prefix, Customer Code, Customer Name (và các cột tùy chọn)."
    );
  }
  const keys: ColKey[] = [
    "prefix",
    "code",
    "name",
    "shortCode",
    "taxCode",
    "address",
    "email",
    "phone",
    "defaultRate",
    "customerType",
  ];
  for (const key of keys) {
    if (map[key] == null) map[key] = -1;
  }
  return map as Record<ColKey, number>;
}

function applyAccountExtras(
  target: CustomerDirectoryEntry,
  row: CustomsOpsImportRow,
  mode: "create" | "update"
): void {
  if (row.shortCode || mode === "create") target.shortCode = row.shortCode || undefined;
  if (row.taxCode || mode === "create") target.taxCode = row.taxCode || undefined;
  if (row.address || mode === "create") target.address = row.address || undefined;
  if (row.email || mode === "create") target.email = row.email || undefined;
  if (row.phone || mode === "create") target.phone = row.phone || undefined;
  if (row.defaultRate != null || mode === "create") {
    target.defaultRate = row.defaultRate;
  }
  if (row.customerType || mode === "create") {
    target.customerType = normalizeCustomerType(row.customerType || "DIRECT_SHIPPER");
  }

  const shippers = [...(target.savedShippers ?? [])];
  if (shippers.length === 0) return;
  const defId = target.defaultShipperId;
  const idx = Math.max(
    0,
    shippers.findIndex((s) => s.id === defId)
  );
  const cur = shippers[idx];
  if (!cur) return;
  shippers[idx] = {
    ...cur,
    shipperName: cur.shipperName || target.name,
    taxCode: row.taxCode || cur.taxCode,
    shipperAddress: row.address || cur.shipperAddress,
    shipperEmail: row.email || cur.shipperEmail,
    shipperPhone: row.phone || cur.shipperPhone,
  };
  target.savedShippers = shippers;
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
    const getRaw = (colIdx: number) =>
      colIdx >= 0 ? row.getCell(colIdx + 1).value : null;
    const prefix = normalizeCustomerPrefix(get(idx.prefix));
    const code = normalizeAgentCode(get(idx.code));
    const name = normalizeCustomerNameInput(get(idx.name));
    const shortCode = normalizeCustomerShortCode(get(idx.shortCode));
    const taxCode = get(idx.taxCode);
    const address = get(idx.address);
    const email = get(idx.email);
    const phone = get(idx.phone);
    const defaultRate = parseDefaultRate(getRaw(idx.defaultRate) ?? get(idx.defaultRate));
    const customerType = get(idx.customerType);
    if (
      !prefix &&
      !code &&
      !name &&
      !shortCode &&
      !taxCode &&
      !address &&
      !email &&
      !phone &&
      defaultRate == null &&
      !customerType
    ) {
      return;
    }
    rows.push({
      rowNumber,
      prefix,
      code,
      name,
      shortCode,
      taxCode,
      address,
      email,
      phone,
      defaultRate,
      customerType,
    });
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
 * Đồng bộ danh bạ theo quy tắc Import Customers:
 * - Code đã có → cập nhật thông tin (Prefix phải khớp nếu có)
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
        if (!hit.prefix && (row.prefix || existingPrefix)) {
          hit.prefix = row.prefix || existingPrefix;
        }
        applyAccountExtras(hit, row, "update");
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
      applyAccountExtras(createdRow, row, "create");
      customers.push(createdRow);
      byCode.set(row.code.toLowerCase(), createdRow);
      created += 1;
      continue;
    }

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
    applyAccountExtras(createdRow, row, "create");
    customers.push(createdRow);
    byCode.set(nextCode.toLowerCase(), createdRow);
    created += 1;
  }

  return { customers, created, updated, skipped, errors };
}

/** Xuất danh bạ đúng 10 cột mẫu Import Customers. */
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
      (c.taxCode ?? "").trim(),
      (c.address ?? "").trim(),
      (c.email ?? "").trim(),
      (c.phone ?? "").trim(),
      formatDefaultRate(c.defaultRate),
      c.customerType ?? "DIRECT_SHIPPER",
    ]);
  }
  ws.getRow(1).font = { bold: true };
  ws.columns = [
    { width: 10 },
    { width: 14 },
    { width: 36 },
    { width: 14 },
    { width: 14 },
    { width: 28 },
    { width: 22 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
  ];

  const guide = wb.addWorksheet("Hướng dẫn");
  [
    "HƯỚNG DẪN IMPORT / ĐỒNG BỘ KHÁCH HÀNG",
    "",
    "1. Không đổi tên cột ở sheet 'Import Customers'.",
    "2. Customer Name: bắt buộc.",
    "3. Customer Code (VD: GLO000001): khóa đồng bộ. Có mã đã tồn tại → cập nhật thông tin. Có mã chưa tồn tại → tạo mới với đúng mã đó.",
    "4. Prefix (2-5 chữ A-Z): bắt buộc khi tạo mới. Khi cập nhật phải khớp prefix hiện có (không được đổi).",
    "5. Nếu bỏ trống Customer Code: hệ thống tạo mới và tự sinh mã từ Prefix.",
    "6. Short Code: tối đa 10 ký tự, tùy chọn.",
    "7. Default Rate: đơn giá cố định VND/kg (có thể để trống).",
    "8. Customer Type: FORWARDER | DIRECT_SHIPPER | AGENT | OTHER (mặc định DIRECT_SHIPPER).",
    "9. Prefix và Customer Code sau khi tạo không thể đổi qua import.",
  ].forEach((line, i) => {
    guide.getRow(i + 1).getCell(1).value = line;
  });
  guide.getColumn(1).width = 100;

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
