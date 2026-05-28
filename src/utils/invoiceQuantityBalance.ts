import type { InvoiceCatalogItem, InvoiceLineItem } from "../types/invoiceItem";
import { roundDeclarationKg, totalsForInvoice } from "../types/invoiceItem";
import type { InvoiceDeclaration } from "../types/invoiceDeclaration";
import type { Shipment } from "../types/shipment";

export type BalanceLineQuantitiesOptions = {
  /** Kg mục tiêu tờ khai (gồm bao bì thực tế). */
  targetKg: number;
  /** Tổng kiện mục tiêu — nếu có, điều chỉnh thêm cột số lượng. */
  targetPcs?: number | null;
  /** Tỷ lệ trọng lượng hàng (net) / kg tờ — random trong khoảng này. */
  netWeightRatioMin?: number;
  netWeightRatioMax?: number;
  rng?: () => number;
};

const DEFAULT_NET_MIN = 0.86;
const DEFAULT_NET_MAX = 0.96;

function randomBetween(rng: () => number, min: number, max: number): number {
  return min + rng() * Math.max(0, max - min);
}

function totalGrossKg(items: readonly InvoiceLineItem[]): number {
  return totalsForInvoice([...items]).totalGrossKg;
}

function totalQuantity(items: readonly InvoiceLineItem[]): number {
  return totalsForInvoice([...items]).totalQuantity;
}

/** Bổ sung kg/đv từ danh mục khi dòng chưa có. */
export function enrichLineItemsKgFromCatalog(
  items: readonly InvoiceLineItem[],
  catalogItems: readonly InvoiceCatalogItem[],
): InvoiceLineItem[] {
  if (catalogItems.length === 0) return items.map((it) => ({ ...it }));
  return items.map((row) => {
    if (row.kgPerUnit > 0) return { ...row };
    const hit =
      (row.catalogId && catalogItems.find((c) => c.id === row.catalogId)) ??
      catalogItems.find((c) => c.description.trim() === row.description.trim());
    if (hit && hit.kgPerUnit > 0) {
      return { ...row, kgPerUnit: hit.kgPerUnit };
    }
    return { ...row };
  });
}

export function resolveSheetBalanceTargets(
  activeDeclaration: InvoiceDeclaration | undefined,
  shipment: Pick<Shipment, "kg" | "pcs">,
): { targetKg: number; targetPcs: number | null } {
  const targetKg = roundDeclarationKg(activeDeclaration?.targetKg ?? shipment.kg ?? null);
  const pcsRaw = activeDeclaration?.targetPcs ?? shipment.pcs ?? null;
  const targetPcs = pcsRaw != null && pcsRaw > 0 ? Math.round(pcsRaw) : null;
  return { targetKg, targetPcs };
}

export type BalanceQuantitiesResult =
  | { ok: true; items: InvoiceLineItem[]; message: string }
  | { ok: false; message: string };

/** Chuẩn bị + cân số lượng; trả message để hiển thị UI. */
export function balanceDeclarationLineItems(
  items: readonly InvoiceLineItem[],
  catalogItems: readonly InvoiceCatalogItem[],
  options: BalanceLineQuantitiesOptions,
): BalanceQuantitiesResult {
  if (items.length === 0) {
    return { ok: false, message: "Thêm ít nhất một dòng hàng trước." };
  }
  const targetKg = Math.round(Number(options.targetKg) || 0);
  if (targetKg <= 0) {
    return { ok: false, message: "Nhập kg tờ khai (mục tiêu tờ hoặc kg lô) trước khi cân." };
  }

  const enriched = enrichLineItemsKgFromCatalog(items, catalogItems);
  if (!enriched.some((it) => it.kgPerUnit > 0)) {
    return {
      ok: false,
      message: "Thiếu kg/đv — chọn hàng từ danh mục hoặc điền cột kg/đv từng dòng.",
    };
  }

  const before = totalsForInvoice(enriched);
  const balanced = balanceLineQuantitiesToDeclaration(enriched, { ...options, targetKg });
  const after = totalsForInvoice(balanced);

  if (after.totalGrossKg >= targetKg) {
    return {
      ok: false,
      message: `Không cân được dưới ${targetKg} kg — kiểm tra kg/đv hoặc giảm số dòng.`,
    };
  }

  const message = `Đã cân ${balanced.length} dòng · ${after.totalQuantity} SL · ${after.totalGrossKg} kg hàng (< ${targetKg} kg tờ, ~${targetKg - after.totalGrossKg} bao bì)`;
  if (
    before.totalQuantity === after.totalQuantity &&
    before.totalGrossKg === after.totalGrossKg
  ) {
    return {
      ok: true,
      items: balanced,
      message: `${message} (giữ nguyên — bấm lại để random khác)`,
    };
  }
  return { ok: true, items: balanced, message };
}

/** Phân bổ số lượng ngẫu nhiên: tổng KG hàng < targetKg (chừa bao bì), gần mục tiêu net. */
export function balanceLineQuantitiesToDeclaration(
  items: readonly InvoiceLineItem[],
  options: BalanceLineQuantitiesOptions,
): InvoiceLineItem[] {
  const rng = options.rng ?? Math.random;
  const targetKg = Math.round(Number(options.targetKg) || 0);
  if (items.length === 0 || targetKg <= 0) {
    return items.map((it) => ({ ...it }));
  }

  const eligible = items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => it.kgPerUnit > 0);
  if (eligible.length === 0) {
    return items.map((it) => ({ ...it }));
  }

  const ratioMin = options.netWeightRatioMin ?? DEFAULT_NET_MIN;
  const ratioMax = options.netWeightRatioMax ?? DEFAULT_NET_MAX;
  const maxNet = Math.max(1, targetKg - 1);
  const minNet = Math.max(1, Math.floor(targetKg * ratioMin));
  const netGoal = Math.min(
    maxNet,
    Math.max(minNet, Math.round(randomBetween(rng, targetKg * ratioMin, targetKg * ratioMax))),
  );

  const weights = eligible.map(() => rng() + 0.05);
  const weightSum = weights.reduce((sum, w) => sum + w, 0) || 1;

  const next = items.map((it) => ({ ...it, quantity: it.kgPerUnit > 0 ? 0 : it.quantity }));

  for (let k = 0; k < eligible.length; k++) {
    const { index, it } = eligible[k]!;
    const kgShare = (weights[k]! / weightSum) * netGoal;
    next[index]!.quantity = Math.max(1, Math.floor(kgShare / it.kgPerUnit));
  }

  let guard = 0;
  while (totalGrossKg(next) >= targetKg && guard++ < 5000) {
    const candidates = eligible.filter(({ index }) => next[index]!.quantity > 1);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)]!;
    next[pick.index]!.quantity -= 1;
  }

  guard = 0;
  while (totalGrossKg(next) < netGoal && totalGrossKg(next) < targetKg - 1 && guard++ < 5000) {
    const pick = eligible[Math.floor(rng() * eligible.length)]!;
    const add = next[pick.index]!.kgPerUnit;
    if (totalGrossKg(next) + add >= targetKg) break;
    next[pick.index]!.quantity += 1;
  }

  const targetPcs =
    options.targetPcs != null && options.targetPcs > 0 ? Math.round(options.targetPcs) : null;
  if (targetPcs != null) {
    alignQuantitiesToTargetPcs(next, eligible, targetPcs, targetKg, rng);
  }

  return next;
}

function alignQuantitiesToTargetPcs(
  items: InvoiceLineItem[],
  eligible: { it: InvoiceLineItem; index: number }[],
  targetPcs: number,
  targetKg: number,
  rng: () => number,
): void {
  let guard = 0;
  while (guard++ < 8000) {
    const qty = totalQuantity(items);
    if (qty === targetPcs) break;

    if (qty < targetPcs) {
      const shuffled = eligible.slice().sort(() => rng() - 0.5);
      let added = false;
      for (const { index } of shuffled) {
        const addKg = items[index]!.kgPerUnit;
        if (totalGrossKg(items) + addKg >= targetKg) continue;
        items[index]!.quantity += 1;
        added = true;
        break;
      }
      if (!added) break;
      continue;
    }

    const candidates = eligible.filter(({ index }) => items[index]!.quantity > 1);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)]!;
    items[pick.index]!.quantity -= 1;
  }
}

/** Badge: tổng KG hàng phải nhỏ hơn kg tờ (phần chênh = bao bì). */
export function grossNetWeightBadge(
  targetKg: number | null | undefined,
  actualKg: number,
): { ok: boolean; text: string } {
  if (targetKg == null || targetKg <= 0) {
    return { ok: true, text: "KG hàng: —" };
  }
  const roundedTarget = Math.round(targetKg);
  const ok = actualKg > 0 && actualKg < roundedTarget;
  const packagingGap = roundedTarget - actualKg;
  if (ok) {
    return {
      ok: true,
      text: `Hàng ${actualKg} KGM (< ${roundedTarget}, ~${packagingGap} bao bì)`,
    };
  }
  if (actualKg >= roundedTarget) {
    return {
      ok: false,
      text: `Hàng ${actualKg} KGM — phải < ${roundedTarget} KGM (chưa trừ bao bì)`,
    };
  }
  return {
    ok: false,
    text: `Hàng ${actualKg} KGM / tờ ${roundedTarget} KGM`,
  };
}

export function isGrossWeightBelowTarget(
  targetKg: number | null | undefined,
  actualKg: number,
): boolean {
  if (targetKg == null || targetKg <= 0) return true;
  return actualKg > 0 && actualKg < Math.round(targetKg);
}
