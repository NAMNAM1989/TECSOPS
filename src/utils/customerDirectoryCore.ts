import type { CustomerDirectoryEntry, CustomerParty, CustomerPartyType } from "../types/customerDirectory";
import {
  clampCustomerDirectoryEntry,
  normalizeCustomerPartyType,
} from "./customerDirectoryProfile";

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function partyTypeFromLabel(label: string): CustomerPartyType {
  const up = label.trim().toUpperCase();
  if (up.startsWith("SHIPPER")) return "SHIPPER";
  if (up.startsWith("CNEE") || up.startsWith("CONSIGNEE")) return "CNEE";
  if (up.startsWith("NOTIFY")) return "NOTIFY";
  return "OTHER";
}

function parsePartiesLoose(o: Record<string, unknown>): CustomerParty[] {
  if (Array.isArray(o.parties)) {
    return o.parties
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: strField(x.id),
        type: normalizeCustomerPartyType(x.type),
        label: strField(x.label),
        content: strField(x.content),
      }));
  }

  if (Array.isArray(o.copySnippets)) {
    return o.copySnippets
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: strField(x.id),
        type: partyTypeFromLabel(strField(x.label)),
        label: strField(x.label),
        content: strField(x.content),
      }));
  }

  const legacyParts: string[] = [];
  const legacyMap: Array<[string, unknown]> = [
    ["MST", o.taxId],
    ["SĐT", o.phone],
    ["EMAIL", o.email],
    ["NGƯỜI LIÊN HỆ", o.contactName],
    ["ĐỊA CHỈ", o.address],
    ["TK / THANH TOÁN", o.bankInfo],
    ["GHI CHÚ", o.detailsText ?? o.details],
  ];
  for (const [label, value] of legacyMap) {
    const text = strField(value).trim();
    if (text) legacyParts.push(`${label}: ${text}`);
  }
  if (legacyParts.length) {
    return [{ id: "legacy-info", type: "OTHER", label: "THÔNG TIN CŨ", content: legacyParts.join("\n") }];
  }
  return [];
}

/** Parse mảng JSON an toàn — bỏ phần tử không hợp lệ; chuẩn hóa độ dài trường. */
export function parseCustomerDirectoryLoose(raw: unknown): CustomerDirectoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomerDirectoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = trimStr(o.id);
    const code = trimStr(o.code);
    const name = trimStr(o.name);
    if (!id || !code || !name) continue;
    out.push(
      clampCustomerDirectoryEntry({
        id,
        code,
        name,
        parties: parsePartiesLoose(o),
      })
    );
  }
  return out;
}

/**
 * Kiểm tra danh sách trước khi lưu — mã không trùng (không phân biệt hoa thường).
 * Độ dài trường do `clampCustomerDirectoryEntry` đảm bảo trước khi gọi hàm này.
 * @throws Error với thông báo tiếng Việt
 */
export function assertCustomerDirectoryValid(entries: readonly CustomerDirectoryEntry[]): void {
  const seenCode = new Map<string, string>();
  for (const e of entries) {
    const k = e.code.trim().toLowerCase();
    if (!e.code.trim()) throw new Error("Mã khách hàng không được để trống.");
    if (!e.name.trim()) throw new Error("Tên khách hàng không được để trống.");
    if (!e.id.trim()) throw new Error("Thiếu id dòng khách hàng — thử thêm dòng mới.");
    if (seenCode.has(k)) {
      throw new Error(`Mã «${e.code}» bị trùng — mỗi mã chỉ dùng một lần.`);
    }
    seenCode.set(k, e.name);
  }
}

/** Tra mã theo tên (khớp không phân biệt hoa thường), lấy bản ghi đầu tiên. */
export function lookupCustomerCodeByName(
  directory: readonly CustomerDirectoryEntry[],
  customerName: string
): string {
  const hit = lookupCustomerEntryByName(directory, customerName);
  return hit?.code.trim() ?? "";
}

/** Tra cả dòng danh bạ theo tên (khớp không phân biệt hoa thường), bản ghi đầu tiên. */
export function lookupCustomerEntryByName(
  directory: readonly CustomerDirectoryEntry[],
  customerName: string
): CustomerDirectoryEntry | undefined {
  const t = customerName.trim().toLowerCase();
  if (!t) return undefined;
  return directory.find((e) => e.name.trim().toLowerCase() === t);
}
