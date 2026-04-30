/** Parse an toàn khi đọc state — không ném lỗi. */
export function parseCustomersLoose(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const code = typeof item.code === "string" ? item.code.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id || !code || !name) continue;
    out.push({ id, code, name });
  }
  return out;
}

/** @param {unknown} raw @returns {{ id: string, code: string, name: string }[]} */
export function validateCustomerDirectoryPayload(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("Danh sách khách hàng phải là một mảng.");
  }
  const out = [];
  const seenCode = new Map();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      throw new Error(`Dòng ${i + 1}: dữ liệu không hợp lệ.`);
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const code = typeof item.code === "string" ? item.code.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id) throw new Error(`Dòng ${i + 1}: thiếu id.`);
    if (!code) throw new Error(`Dòng ${i + 1}: mã khách hàng không được để trống.`);
    if (!name) throw new Error(`Dòng ${i + 1}: tên khách hàng không được để trống.`);
    const k = code.toLowerCase();
    if (seenCode.has(k)) {
      throw new Error(`Mã «${code}» bị trùng — mỗi mã chỉ dùng một lần.`);
    }
    seenCode.set(k, true);
    out.push({ id, code, name });
  }
  return out;
}
