import type { CustomerDirectoryEntry, CustomerSavedDimTemplate } from "../types/customerDirectory";
import type { DimPieceLine } from "./volumetricDim";

export type DimTemplateApplyMode = "replace" | "insert" | "scale";

/** Scale tỉ lệ kiện mẫu → tổng = declaredPcs (giữ tỉ lệ, làm tròn, chỉnh dòng cuối). */
export function scaleTemplateLinesToLotPcs(
  lines: DimPieceLine[],
  declaredPcs: number,
): DimPieceLine[] {
  if (!lines.length || !Number.isFinite(declaredPcs) || declaredPcs <= 0) {
    return lines.map((l) => ({ ...l }));
  }
  const total = lines.reduce((s, l) => s + l.pcs, 0);
  if (total <= 0) return lines.map((l) => ({ ...l }));

  const scaled = lines.map((l) => ({
    ...l,
    pcs: Math.max(1, Math.round((l.pcs / total) * declaredPcs)),
    estimated: false as const,
  }));

  let sum = scaled.reduce((s, l) => s + l.pcs, 0);
  const last = scaled[scaled.length - 1]!;
  const delta = declaredPcs - sum;
  last.pcs = Math.max(1, last.pcs + delta);
  // nếu vẫn lệch do max(1), phân bổ lại đơn giản
  sum = scaled.reduce((s, l) => s + l.pcs, 0);
  if (sum !== declaredPcs && scaled.length === 1) {
    scaled[0]!.pcs = declaredPcs;
  } else if (sum > declaredPcs) {
    let overflow = sum - declaredPcs;
    for (let i = scaled.length - 1; i >= 0 && overflow > 0; i--) {
      const row = scaled[i]!;
      const take = Math.min(overflow, Math.max(0, row.pcs - 1));
      row.pcs -= take;
      overflow -= take;
    }
  } else if (sum < declaredPcs) {
    last.pcs += declaredPcs - sum;
  }

  return scaled;
}

/** Chèn dòng mẫu vào sau các dòng đo thật; giữ ước tính. */
export function insertTemplateLines(
  current: DimPieceLine[],
  template: DimPieceLine[],
): DimPieceLine[] {
  const measured = current.filter((l) => !l.estimated);
  const estimated = current.filter((l) => l.estimated);
  const inserted = template.map((l) => ({
    ...l,
    estimated: false as boolean | undefined,
  }));
  return [...measured, ...inserted, ...estimated];
}

export function applyDimTemplateLines(
  current: DimPieceLine[],
  template: DimPieceLine[],
  mode: DimTemplateApplyMode,
  declaredPcs: number | null | undefined,
): DimPieceLine[] {
  const clean = template.map((l) => ({
    lCm: l.lCm,
    wCm: l.wCm,
    hCm: l.hCm,
    pcs: l.pcs,
    estimated: false as boolean | undefined,
  }));

  if (mode === "replace") return clean;
  if (mode === "insert") return insertTemplateLines(current, clean);
  if (declaredPcs != null && declaredPcs > 0) {
    return scaleTemplateLinesToLotPcs(clean, declaredPcs);
  }
  return clean;
}

/** Mẫu kích thước mặc định trên hồ sơ khách (1 size). */
export function resolveDefaultCustomerDimTemplate(
  customer: CustomerDirectoryEntry | null | undefined,
): CustomerSavedDimTemplate | null {
  if (!customer?.savedDimTemplates?.length) return null;
  const list = customer.savedDimTemplates;
  if (customer.defaultDimTemplateId) {
    const byId = list.find((t) => t.id === customer.defaultDimTemplateId);
    if (byId) return byId;
  }
  const flagged = list.find((t) => t.isDefault);
  if (flagged) return flagged;
  if (list.length === 1) return list[0]!;
  return null;
}

/** Đổi mẫu khách → dòng đo (ưu tiên `lines` multi). */
export function customerDimTemplateToPieceLines(
  tmpl: CustomerSavedDimTemplate,
  declaredPcs?: number | null,
): DimPieceLine[] {
  if (tmpl.lines?.length) {
    const mapped = tmpl.lines.map((l) => ({
      lCm: l.lCm,
      wCm: l.wCm,
      hCm: l.hCm,
      pcs: l.pcs,
      estimated: false as const,
    }));
    if (declaredPcs != null && declaredPcs > 0) {
      const sum = mapped.reduce((s, l) => s + l.pcs, 0);
      if (sum !== declaredPcs) return scaleTemplateLinesToLotPcs(mapped, declaredPcs);
    }
    return mapped;
  }
  const pcs =
    declaredPcs != null && declaredPcs > 0 ? Math.floor(declaredPcs) : 1;
  return [
    {
      lCm: tmpl.lCm,
      wCm: tmpl.wCm,
      hCm: tmpl.hCm,
      pcs,
      estimated: false,
    },
  ];
}

/** Seed dòng đo từ mẫu khách mặc định khi lô chưa có DIM. */
export function seedLinesFromCustomerDefault(
  customer: CustomerDirectoryEntry | null | undefined,
  declaredPcs: number | null | undefined,
): DimPieceLine[] | null {
  const tmpl = resolveDefaultCustomerDimTemplate(customer);
  if (!tmpl) return null;
  return customerDimTemplateToPieceLines(tmpl, declaredPcs);
}

/** Tạo payload mẫu khách (multi-line) từ bảng DIM đo. */
export function pieceLinesToCustomerDimTemplate(params: {
  id?: string;
  label: string;
  lines: DimPieceLine[];
  isDefault?: boolean;
}): CustomerSavedDimTemplate | null {
  const measured = params.lines.filter((l) => !l.estimated);
  const source = measured.length > 0 ? measured : params.lines;
  if (!source.length) return null;
  const lines = source.map((l) => ({
    lCm: Math.round(l.lCm),
    wCm: Math.round(l.wCm),
    hCm: Math.round(l.hCm),
    pcs: Math.max(1, Math.round(l.pcs)),
  }));
  const head = lines[0]!;
  return {
    id: params.id || `dimtmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: params.label.trim() || `${head.lCm}×${head.wCm}×${head.hCm}`,
    lCm: head.lCm,
    wCm: head.wCm,
    hCm: head.hCm,
    lines,
    ...(params.isDefault ? { isDefault: true } : {}),
  };
}
