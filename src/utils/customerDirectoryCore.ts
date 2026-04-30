import type { CustomerDirectoryEntry } from "../types/customerDirectory";

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Parse mảng JSON an toàn — bỏ phần tử không hợp lệ. */
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
    out.push({ id, code, name });
  }
  return out;
}

/**
 * Kiểm tra danh sách trước khi lưu — mã không trùng (không phân biệt hoa thường).
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
  const t = customerName.trim().toLowerCase();
  if (!t) return "";
  const hit = directory.find((e) => e.name.trim().toLowerCase() === t);
  return hit?.code.trim() ?? "";
}
