/**
 * Danh sách tên mặc định — giữ khớp `CUSTOMERS` trong `src/data/customers.ts`
 * (khi state cũ không có trường `customers`, máy chủ seed danh bạ từ đây).
 */
const SEED_NAMES = [
  "CITYLINK",
  "SKYLINK",
  "CÔNG CHÚA",
  "MINH KHÔI",
  "PCS",
  "TTP",
  "SHOPEE",
  "GSHIP",
  "GATEWAY",
  "QUÝ NAM",
  "TÍN PHÁT",
  "GIA PHÚ",
  "VAU",
];

export function buildDefaultCustomerDirectoryFromSeed() {
  return SEED_NAMES.map((name, i) => ({
    id: `seed-${i}`,
    code: `KH${String(i + 1).padStart(3, "0")}`,
    name,
  }));
}
