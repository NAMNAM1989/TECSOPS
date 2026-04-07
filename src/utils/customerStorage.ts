const STORAGE_KEY = "tecsops-saved-customers-v1";

function readSaved(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

/** Gộp danh sách gốc + khách đã lưu, không trùng (không phân biệt hoa thường) */
export function mergeCustomerOptions(base: readonly string[]): string[] {
  const map = new Map<string, string>();
  for (const c of base) {
    const t = c.trim();
    if (t) map.set(t.toLowerCase(), t);
  }
  for (const c of readSaved()) {
    const t = c.trim();
    if (t && !map.has(t.toLowerCase())) map.set(t.toLowerCase(), t);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "vi"));
}

/** Lưu tên khách mới (bỏ qua nếu trùng gốc hoặc đã có trong storage) */
export function persistNewCustomer(name: string, base: readonly string[]): void {
  const t = name.trim();
  if (!t) return;
  const k = t.toLowerCase();
  if (base.some((c) => c.trim().toLowerCase() === k)) return;
  const saved = readSaved();
  if (saved.some((c) => c.trim().toLowerCase() === k)) return;
  saved.push(t);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}
