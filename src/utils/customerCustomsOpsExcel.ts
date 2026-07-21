import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  formatDefaultRate,
  normalizeCustomerType,
  parseDefaultRate,
} from "./customerAccountFields";
import {
  inferLetterKeyFromCustomerCode,
  isValidCustomerSyncCode,
  normalizeCustomerShortCode,
  normalizeCustomerSyncCode,
} from "./customerCodeOps";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";
import { normalizeAgentCode } from "./customerProfileInputFormat";
import { normalizeCustomerNameInput } from "./customerShipmentPatch";

/** Cột đúng mẫu Import Customers (9 cột). */
export const CUSTOMS_OPS_HEADERS = [
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
  /** Mã đồng bộ 2–5 chữ A–Z (hoặc mã đầy đủ từ file cũ). */
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

  /** File mẫu cũ: cột Prefix được coi là Customer Code. */
  if (map.code == null && map.prefix != null) {
    map.code = map.prefix;
  }

  if (map.name == null || map.code == null) {
    throw new Error(
      "File không đúng mẫu — cần cột Customer Code, Customer Name (và các cột tùy chọn)."
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

/** Chuẩn hoá mã import: ưu tiên Customer Code; nếu trống thì lấy cột Prefix (file cũ). */
function resolveImportCode(codeRaw: string, legacyPrefixRaw: string): string {
  const code = normalizeAgentCode(codeRaw);
  if (code) return code;
  return normalizeCustomerSyncCode(legacyPrefixRaw);
}

function applyAccountExtras(
  target: CustomerDirectoryEntry,
  row: CustomsOpsImportRow,
  mode: "create" | "update"
): void {
  const short =
    normalizeCustomerShortCode(row.shortCode) ||
    (isValidCustomerSyncCode(row.code) ? normalizeCustomerSyncCode(row.code) : row.code) ||
    undefined;
  if (row.shortCode || mode === "create") target.shortCode = short;
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
    const prefixRaw = get(idx.prefix);
    const code = resolveImportCode(get(idx.code), prefixRaw);
    const name = normalizeCustomerNameInput(get(idx.name));
    const shortCode = normalizeCustomerShortCode(get(idx.shortCode));
    const taxCode = get(idx.taxCode);
    const address = get(idx.address);
    const email = get(idx.email);
    const phone = get(idx.phone);
    const defaultRate = parseDefaultRate(getRaw(idx.defaultRate) ?? get(idx.defaultRate));
    const customerType = get(idx.customerType);
    if (
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

/** Khóa đồng bộ: mã 2–5 chữ → khớp exact hoặc mã cũ dạng GLO000001; còn lại exact. */
function findExistingByImportCode(
  customers: CustomerDirectoryEntry[],
  byCode: Map<string, CustomerDirectoryEntry>,
  importCode: string
): CustomerDirectoryEntry | null {
  const exact = byCode.get(importCode.toLowerCase());
  if (exact) return exact;

  if (!isValidCustomerSyncCode(importCode)) return null;
  const key = normalizeCustomerSyncCode(importCode);
  return (
    customers.find((c) => {
      const code = normalizeAgentCode(c.code);
      if (code === key) return true;
      const letterKey = inferLetterKeyFromCustomerCode(code);
      return letterKey === key && (code === key || code.startsWith(key));
    }) ?? null
  );
}

/**
 * Đồng bộ danh bạ theo mẫu Import Customers (9 cột):
 * - Customer Code (2–5 chữ A–Z): khóa đồng bộ
 * - Mã đã có → cập nhật; mã chưa có → tạo mới
 * - File cũ có cột Prefix: coi Prefix là Customer Code khi thiếu mã
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

    const code = normalizeAgentCode(row.code);
    if (!code) {
      errors.push({
        rowNumber: row.rowNumber,
        message: "Customer Code bắt buộc (VD: GLO — 2–5 chữ A–Z).",
      });
      skipped += 1;
      continue;
    }

    if (!/^[A-Z0-9]+$/i.test(code)) {
      errors.push({
        rowNumber: row.rowNumber,
        message: "Customer Code không hợp lệ.",
      });
      skipped += 1;
      continue;
    }

    /** Mẫu mới: 2–5 chữ; vẫn chấp nhận mã đầy đủ từ dữ liệu cũ (vd. GLO000001). */
    if (code.length <= 5 && !isValidCustomerSyncCode(code)) {
      errors.push({
        rowNumber: row.rowNumber,
        message: "Customer Code phải gồm 2–5 chữ cái A–Z (VD: GLO, ABC).",
      });
      skipped += 1;
      continue;
    }

    const hit = findExistingByImportCode(customers, byCode, code);
    if (hit) {
      hit.name = name;
      applyAccountExtras(hit, { ...row, code: hit.code }, "update");
      updated += 1;
      continue;
    }

    const createdRow = scaffoldNewCustomer(newCustomerId());
    createdRow.code = code;
    createdRow.name = name;
    applyAccountExtras(createdRow, row, "create");
    customers.push(createdRow);
    byCode.set(code.toLowerCase(), createdRow);
    created += 1;
  }

  return { customers, created, updated, skipped, errors };
}

/** Xuất danh bạ đúng 9 cột mẫu Import Customers. */
export async function buildCustomsOpsWorkbook(customers: readonly CustomerDirectoryEntry[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import Customers");
  ws.addRow([...CUSTOMS_OPS_HEADERS]);
  for (const c of customers) {
    const code = normalizeAgentCode(c.code);
    const short =
      normalizeCustomerShortCode(c.shortCode ?? "") ||
      (isValidCustomerSyncCode(code) ? code : inferLetterKeyFromCustomerCode(code)) ||
      code;
    ws.addRow([
      code,
      c.name.trim(),
      short,
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
    { width: 16 },
    { width: 36 },
    { width: 14 },
    { width: 14 },
    { width: 36 },
    { width: 22 },
    { width: 16 },
    { width: 12 },
    { width: 16 },
  ];

  const guide = wb.addWorksheet("Hướng dẫn");
  [
    "HƯỚNG DẪN IMPORT / ĐỒNG BỘ KHÁCH HÀNG",
    "",
    "1. Không đổi tên cột ở sheet 'Import Customers'.",
    "2. Customer Name: bắt buộc.",
    "3. Customer Code (VD: GLO — 2-5 ký tự chữ cái A-Z): khóa đồng bộ. Mã đã tồn tại → cập nhật thông tin. Mã chưa tồn tại → tạo mới.",
    "4. Short Code: tối đa 10 ký tự (cho phép khoảng trắng giữa từ), tùy chọn (trống = dùng Customer Code).",
    "5. Default Rate: đơn giá cố định VND/kg (có thể để trống).",
    "6. Customer Type: FORWARDER | DIRECT_SHIPPER | AGENT | OTHER (mặc định DIRECT_SHIPPER).",
    "7. Customer Code sau khi tạo không thể đổi qua import.",
    "8. File mẫu cũ có cột 'Prefix' vẫn dùng được — hệ thống tự coi Prefix là Customer Code.",
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
