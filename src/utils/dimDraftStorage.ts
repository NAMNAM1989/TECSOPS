import type { DimPieceLine } from "./volumetricDim";

const DRAFT_KEY_PREFIX = "tecsops_dim_draft_v1_";

export type DimDraftSnapshot = {
  shipmentId: string;
  lines: DimPieceLine[];
  declaredPcs: number | null;
  declaredKg: number | null;
  savedAt: number;
};

function cloneLines(lines: DimPieceLine[]): DimPieceLine[] {
  return lines.map((l) => ({ ...l }));
}

function parseLines(raw: unknown): DimPieceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: DimPieceLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const lCm = Number(o.lCm);
    const wCm = Number(o.wCm);
    const hCm = Number(o.hCm);
    const pcs = Number(o.pcs);
    if (![lCm, wCm, hCm, pcs].every((n) => Number.isFinite(n) && n > 0)) continue;
    out.push({
      lCm: Math.round(lCm),
      wCm: Math.round(wCm),
      hCm: Math.round(hCm),
      pcs: Math.max(1, Math.round(pcs)),
      ...(o.estimated ? { estimated: true } : {}),
      ...(o.locked ? { locked: true } : {}),
    });
  }
  return out;
}

export function dimDraftStorageKey(shipmentId: string): string {
  return DRAFT_KEY_PREFIX + shipmentId;
}

export function loadDimDraft(shipmentId: string): DimDraftSnapshot | null {
  if (!shipmentId || typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(dimDraftStorageKey(shipmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DimDraftSnapshot>;
    const lines = parseLines(parsed.lines);
    if (!lines.length) return null;
    return {
      shipmentId,
      lines,
      declaredPcs:
        parsed.declaredPcs != null && Number.isFinite(Number(parsed.declaredPcs))
          ? Number(parsed.declaredPcs)
          : null,
      declaredKg:
        parsed.declaredKg != null && Number.isFinite(Number(parsed.declaredKg))
          ? Number(parsed.declaredKg)
          : null,
      savedAt: Number(parsed.savedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveDimDraft(
  shipmentId: string,
  lines: DimPieceLine[],
  meta: { declaredPcs: number | null; declaredKg: number | null },
): DimDraftSnapshot | null {
  if (!shipmentId || !lines.length) {
    clearDimDraft(shipmentId);
    return null;
  }
  const snap: DimDraftSnapshot = {
    shipmentId,
    lines: cloneLines(lines),
    declaredPcs: meta.declaredPcs,
    declaredKg: meta.declaredKg,
    savedAt: Date.now(),
  };
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(dimDraftStorageKey(shipmentId), JSON.stringify(snap));
    } catch {
      // ignore
    }
  }
  return snap;
}

export function clearDimDraft(shipmentId: string): void {
  if (!shipmentId || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(dimDraftStorageKey(shipmentId));
  } catch {
    // ignore
  }
}

/** true nếu kiện/kg lô đã đổi so với lúc lưu draft. */
export function dimDraftParentChanged(
  draft: DimDraftSnapshot | null | undefined,
  declaredPcs: number | null | undefined,
  declaredKg: number | null | undefined,
): boolean {
  if (!draft) return false;
  const pcsNow = declaredPcs ?? null;
  const kgNow = declaredKg ?? null;
  return draft.declaredPcs !== pcsNow || draft.declaredKg !== kgNow;
}
