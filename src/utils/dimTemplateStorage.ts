import type { DimPieceLine } from "./volumetricDim";

export type DimTemplateLine = {
  lCm: number;
  wCm: number;
  hCm: number;
  pcs: number;
};

export type DimTemplate = {
  id: string;
  name: string;
  createdAt: number;
  customerCode?: string;
  lines: DimTemplateLine[];
  totalPcs: number;
  note?: string;
};

const DIM_TEMPLATES_STORAGE_KEY = "tecsops_dim_templates_v1";
const MAX_TEMPLATES = 30;

export function loadDimTemplates(): DimTemplate[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(DIM_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: DimTemplate[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.id || "").trim();
      const name = String(item.name || "").trim();
      const createdAt = Number(item.createdAt) || Date.now();
      if (!id || !name) continue;
      if (!Array.isArray(item.lines) || item.lines.length === 0) continue;

      const lines: DimTemplateLine[] = [];
      for (const l of item.lines) {
        if (!l || typeof l !== "object") continue;
        const lCm = Math.round(Number(l.lCm));
        const wCm = Math.round(Number(l.wCm));
        const hCm = Math.round(Number(l.hCm));
        const pcs = Math.max(1, Math.round(Number(l.pcs) || 1));
        if (lCm <= 0 || wCm <= 0 || hCm <= 0) continue;
        lines.push({ lCm, wCm, hCm, pcs });
      }

      if (lines.length === 0) continue;
      const totalPcs = lines.reduce((s, l) => s + l.pcs, 0);
      const customerCode = item.customerCode ? String(item.customerCode).toUpperCase() : undefined;
      const note = item.note ? String(item.note) : undefined;

      const tmpl: DimTemplate = { id, name, createdAt, customerCode, lines, totalPcs, note };
      result.push(tmpl);
    }
    return result;
  } catch {
    return [];
  }
}

export function saveDimTemplate(params: {
  name: string;
  lines: DimPieceLine[];
  customerCode?: string;
  note?: string;
}): DimTemplate[] {
  const name = params.name.trim();
  if (!name) throw new Error("Tên mẫu không được để trống.");

  const measuredLines = params.lines.filter((l) => !l.estimated);
  const targetLines = measuredLines.length > 0 ? measuredLines : params.lines;
  if (targetLines.length === 0) throw new Error("Cần ít nhất 1 dòng DIM để lưu mẫu.");

  const lines: DimTemplateLine[] = targetLines.map((l) => ({
    lCm: Math.round(l.lCm),
    wCm: Math.round(l.wCm),
    hCm: Math.round(l.hCm),
    pcs: Math.max(1, Math.round(l.pcs)),
  }));

  const totalPcs = lines.reduce((s, l) => s + l.pcs, 0);
  const current = loadDimTemplates();

  const id = `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newTemplate: DimTemplate = {
    id,
    name,
    createdAt: Date.now(),
    customerCode: params.customerCode ? params.customerCode.toUpperCase() : undefined,
    lines,
    totalPcs,
    note: params.note,
  };

  // Đưa mẫu mới lên đầu, lọc bỏ mẫu trùng ID nếu có, giới hạn max 30 mẫu
  const nextList = [newTemplate, ...current.filter((t) => t.id !== id)].slice(0, MAX_TEMPLATES);

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(DIM_TEMPLATES_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // ignore
    }
  }
  return nextList;
}

export function deleteDimTemplate(id: string): DimTemplate[] {
  const current = loadDimTemplates();
  const nextList = current.filter((t) => t.id !== id);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(DIM_TEMPLATES_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // ignore
    }
  }
  return nextList;
}

export function renameDimTemplate(id: string, newName: string): DimTemplate[] {
  const name = newName.trim();
  if (!name) return loadDimTemplates();
  const current = loadDimTemplates();
  const nextList = current.map((t) => (t.id === id ? { ...t, name } : t));
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(DIM_TEMPLATES_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // ignore
    }
  }
  return nextList;
}
