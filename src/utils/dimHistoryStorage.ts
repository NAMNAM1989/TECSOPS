import type { DimPresetSize } from "./dimBulkFill";

const DIM_HISTORY_STORAGE_KEY_PREFIX = "tecsops_customer_dim_history_v1_";

export function loadCustomerDimHistory(customerCode: string): DimPresetSize[] {
  if (!customerCode) return [];
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(DIM_HISTORY_STORAGE_KEY_PREFIX + customerCode.toUpperCase());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const lCm = Number(item.lCm);
        const wCm = Number(item.wCm);
        const hCm = Number(item.hCm);
        if (!Number.isFinite(lCm) || lCm <= 0) return null;
        if (!Number.isFinite(wCm) || wCm <= 0) return null;
        if (!Number.isFinite(hCm) || hCm <= 0) return null;
        const id = String(item.id || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
        const label = String(item.label || `${lCm}×${wCm}×${hCm}`).trim();
        const description = String(item.description || `${lCm}×${wCm}×${hCm} cm`).trim();
        return { id, label, lCm, wCm, hCm, description };
      })
      .filter((item): item is DimPresetSize => item != null);
  } catch {
    return [];
  }
}

export function saveCustomerDimHistory(customerCode: string, lines: { lCm: number; wCm: number; hCm: number }[]): DimPresetSize[] {
  if (!customerCode || !lines.length) return [];
  
  const current = loadCustomerDimHistory(customerCode);
  const nextPresets: DimPresetSize[] = [...current];

  for (const line of lines) {
    const lCm = Math.round(line.lCm);
    const wCm = Math.round(line.wCm);
    const hCm = Math.round(line.hCm);
    
    // Tránh trùng lặp kích thước đã có
    const exists = nextPresets.some((p) => p.lCm === lCm && p.wCm === wCm && p.hCm === hCm);
    if (exists) continue;

    const id = `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const label = `${lCm}×${wCm}×${hCm}`;
    const description = `🕒 [Lịch sử] ${lCm}×${wCm}×${hCm} cm`;
    
    nextPresets.unshift({ id, label, lCm, wCm, hCm, description });
  }

  const nextList = nextPresets.slice(0, 10); // Lưu tối đa 10 mẫu kích thước gần nhất

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(DIM_HISTORY_STORAGE_KEY_PREFIX + customerCode.toUpperCase(), JSON.stringify(nextList));
    } catch {
      // ignore storage errors
    }
  }
  return nextList;
}
