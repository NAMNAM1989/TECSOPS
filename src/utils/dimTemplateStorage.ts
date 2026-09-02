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

const CUSTOMER_RECENT_DIMS_STORAGE_KEY = "tecsops_customer_recent_dims_v1";
const MAX_CUSTOMER_RECENT_DIMS = 6;

export type CustomerRecentDimSize = {
  lCm: number;
  wCm: number;
  hCm: number;
  label?: string;
  updatedAt: number;
};

function normalizeCustomerKey(key: string): string {
  return key.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Tải danh sách kích thước thường dùng / gần nhất theo khách hàng */
export function loadCustomerRecentDims(customerKey: string): CustomerRecentDimSize[] {
  const normKey = normalizeCustomerKey(customerKey);
  if (!normKey || typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOMER_RECENT_DIMS_STORAGE_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw);
    if (!map || typeof map !== "object") return [];
    const list = map[normKey];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is CustomerRecentDimSize =>
        Boolean(
          item &&
            typeof item === "object" &&
            Number(item.lCm) > 0 &&
            Number(item.wCm) > 0 &&
            Number(item.hCm) > 0,
        ),
    );
  } catch {
    return [];
  }
}

/** Tự động ghi nhớ các kích thước vừa đo/lưu cho khách hàng */
export function recordCustomerRecentDims(
  customerKey: string,
  lines: Array<{ lCm: number; wCm: number; hCm: number; label?: string }>,
): void {
  const normKey = normalizeCustomerKey(customerKey);
  if (!normKey || !lines.length || typeof window === "undefined" || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_RECENT_DIMS_STORAGE_KEY);
    const map: Record<string, CustomerRecentDimSize[]> = raw ? JSON.parse(raw) || {} : {};
    const existing = Array.isArray(map[normKey]) ? map[normKey]! : [];

    const now = Date.now();
    const uniqueSizes = new Map<string, CustomerRecentDimSize>();

    // Đưa các dòng mới lên đầu
    for (const l of lines) {
      const lCm = Math.round(Number(l.lCm));
      const wCm = Math.round(Number(l.wCm));
      const hCm = Math.round(Number(l.hCm));
      if (lCm <= 0 || wCm <= 0 || hCm <= 0) continue;
      const key = `${lCm}x${wCm}x${hCm}`;
      if (!uniqueSizes.has(key)) {
        uniqueSizes.set(key, {
          lCm,
          wCm,
          hCm,
          label: l.label?.trim() || undefined,
          updatedAt: now,
        });
      }
    }

    // Giữ các dòng cũ chưa bị trùng
    for (const item of existing) {
      const key = `${item.lCm}x${item.wCm}x${item.hCm}`;
      if (!uniqueSizes.has(key)) {
        uniqueSizes.set(key, item);
      }
    }

    const updatedList = Array.from(uniqueSizes.values()).slice(0, MAX_CUSTOMER_RECENT_DIMS);
    map[normKey] = updatedList;
    window.localStorage.setItem(CUSTOMER_RECENT_DIMS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** Xóa 1 kích thước khỏi danh sách gần đây của khách */
export function deleteCustomerRecentDim(
  customerKey: string,
  size: { lCm: number; wCm: number; hCm: number },
): CustomerRecentDimSize[] {
  const normKey = normalizeCustomerKey(customerKey);
  if (!normKey || typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOMER_RECENT_DIMS_STORAGE_KEY);
    if (!raw) return [];
    const map: Record<string, CustomerRecentDimSize[]> = JSON.parse(raw) || {};
    const existing = Array.isArray(map[normKey]) ? map[normKey]! : [];
    const filtered = existing.filter(
      (item) => !(item.lCm === size.lCm && item.wCm === size.wCm && item.hCm === size.hCm),
    );
    map[normKey] = filtered;
    window.localStorage.setItem(CUSTOMER_RECENT_DIMS_STORAGE_KEY, JSON.stringify(map));
    return filtered;
  } catch {
    return [];
  }
}

