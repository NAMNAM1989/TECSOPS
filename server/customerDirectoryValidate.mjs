/** Giới hạn độ dài — giữ khớp `src/utils/customerDirectoryProfile.ts` (CUSTOMER_PROFILE_LIMITS). */
const L = {
  code: 40,
  name: 200,
  partyLabel: 80,
  partyContent: 8000,
  partyCount: 60,
};

function sliceStr(v, max) {
  const s = typeof v === "string" ? v : "";
  return s.slice(0, max);
}

function normalizePartyType(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw === "SHIPPER" || raw === "CNEE" || raw === "NOTIFY" || raw === "OTHER" ? raw : "OTHER";
}

function partyTypeFromLabel(label) {
  const up = String(label || "").trim().toUpperCase();
  if (up.startsWith("SHIPPER")) return "SHIPPER";
  if (up.startsWith("CNEE") || up.startsWith("CONSIGNEE")) return "CNEE";
  if (up.startsWith("NOTIFY")) return "NOTIFY";
  return "OTHER";
}

function parsePartiesLoose(item) {
  if (Array.isArray(item.parties)) {
    return item.parties
      .filter((x) => x && typeof x === "object")
      .slice(0, L.partyCount)
      .map((x, i) => ({
        id: sliceStr(x.id, 80).trim() || `party-${i}`,
        type: normalizePartyType(x.type),
        label: sliceStr(x.label, L.partyLabel).trim(),
        content: sliceStr(x.content, L.partyContent),
      }))
      .filter((x) => x.label || x.content.trim());
  }

  if (Array.isArray(item.copySnippets)) {
    return item.copySnippets
      .filter((x) => x && typeof x === "object")
      .slice(0, L.partyCount)
      .map((x, i) => ({
        id: sliceStr(x.id, 80).trim() || `party-${i}`,
        type: partyTypeFromLabel(x.label),
        label: sliceStr(x.label, L.partyLabel).trim(),
        content: sliceStr(x.content, L.partyContent),
      }))
      .filter((x) => x.label || x.content.trim());
  }

  const legacy = [
    ["MST", item.taxId],
    ["SĐT", item.phone],
    ["EMAIL", item.email],
    ["NGƯỜI LIÊN HỆ", item.contactName],
    ["ĐỊA CHỈ", item.address],
    ["TK / THANH TOÁN", item.bankInfo],
    ["GHI CHÚ", item.detailsText ?? item.details],
  ]
    .map(([label, value]) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);
  if (legacy.length) return [{ id: "legacy-info", type: "OTHER", label: "THÔNG TIN CŨ", content: legacy.join("\n") }];
  return [];
}

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
    out.push({
      id: sliceStr(id, 80).trim(),
      code: sliceStr(code, L.code).trim(),
      name: sliceStr(name, L.name).trim(),
      parties: parsePartiesLoose(item),
    });
  }
  return out;
}

/** @param {unknown} raw */
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
    out.push({
      id: sliceStr(id, 80).trim(),
      code: sliceStr(code, L.code).trim(),
      name: sliceStr(name, L.name).trim(),
      parties: parsePartiesLoose(item),
    });
  }
  return out;
}
