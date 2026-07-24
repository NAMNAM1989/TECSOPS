import type { DimPresetSize } from "./dimBulkFill";

const CUSTOM_PRESETS_STORAGE_KEY = "tecsops_custom_dim_presets_v1";

export function loadCustomDimPresets(): DimPresetSize[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
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
        const id = String(item.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
        const label = String(item.label || `${lCm}×${wCm}×${hCm}`).trim();
        const description = String(item.description || `${lCm}×${wCm}×${hCm} cm`).trim();
        return { id, label, lCm, wCm, hCm, description };
      })
      .filter((item): item is DimPresetSize => item != null);
  } catch {
    return [];
  }
}

export function saveCustomDimPreset(preset: Omit<DimPresetSize, "id" | "description"> & { id?: string; description?: string }): DimPresetSize[] {
  const current = loadCustomDimPresets();
  const id = preset.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const description = preset.description || `${preset.lCm}×${preset.wCm}×${preset.hCm} cm`;
  const nextItem: DimPresetSize = {
    id,
    label: preset.label.trim() || `${preset.lCm}×${preset.wCm}×${preset.hCm}`,
    lCm: Math.round(preset.lCm),
    wCm: Math.round(preset.wCm),
    hCm: Math.round(preset.hCm),
    description,
  };
  const filtered = current.filter((p) => p.id !== id);
  const nextList = [nextItem, ...filtered].slice(0, 20); // max 20 custom presets
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // ignore storage errors
    }
  }
  return nextList;
}

export function removeCustomDimPreset(id: string): DimPresetSize[] {
  const current = loadCustomDimPresets();
  const nextList = current.filter((p) => p.id !== id);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // ignore storage errors
    }
  }
  return nextList;
}
