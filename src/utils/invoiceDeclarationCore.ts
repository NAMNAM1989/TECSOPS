import type { InvoiceLineItem } from "../types/invoiceItem";
import { emptyInvoiceLineItem, totalsForInvoice } from "../types/invoiceItem";
import type { InvoiceDeclaration } from "../types/invoiceDeclaration";
import type { Shipment } from "../types/shipment";

export type DeclarationTotalsSummary = {
  totalQuantity: number;
  totalGrossKg: number;
  totalAmountUsd: number;
};

export type ShipmentTotalsLock = {
  shipmentPcs: number | null;
  shipmentKg: number | null;
  actualPcs: number;
  actualKg: number;
  pcsOk: boolean;
  kgOk: boolean;
  pcsDelta: number;
  kgDelta: number;
};

export function cloneLineItem(
  item: InvoiceLineItem,
  overrides?: Partial<InvoiceLineItem>
): InvoiceLineItem {
  return emptyInvoiceLineItem({
    ...item,
    lineId: undefined,
    ...overrides,
  });
}

export function summarizeDeclarations(declarations: readonly InvoiceDeclaration[]): DeclarationTotalsSummary {
  return declarations.reduce<DeclarationTotalsSummary>(
    (acc, d) => {
      const t = totalsForInvoice(d.items);
      acc.totalQuantity += t.totalQuantity;
      acc.totalGrossKg += t.totalGrossKg;
      acc.totalAmountUsd += t.totalAmountUsd;
      return acc;
    },
    { totalQuantity: 0, totalGrossKg: 0, totalAmountUsd: 0 }
  );
}

/** So khớp tổng mọi tờ với kiện/kg lô hàng. */
export function validateDeclarationsLock(
  declarations: readonly InvoiceDeclaration[],
  shipmentPcs: number | null,
  shipmentKg: number | null
): ShipmentTotalsLock {
  const sum = summarizeDeclarations(declarations);
  const actualPcs = sum.totalQuantity;
  const actualKg = Number(sum.totalGrossKg.toFixed(1));
  const pcsDelta = shipmentPcs != null ? actualPcs - shipmentPcs : 0;
  const kgDelta = shipmentKg != null ? Number((actualKg - shipmentKg).toFixed(1)) : 0;
  const pcsOk = shipmentPcs == null || shipmentPcs <= 0 || Math.abs(pcsDelta) < 1e-3;
  const kgOk = shipmentKg == null || shipmentKg <= 0 || Math.abs(kgDelta) < 0.05;
  return {
    shipmentPcs,
    shipmentKg,
    actualPcs,
    actualKg,
    pcsOk,
    kgOk,
    pcsDelta,
    kgDelta,
  };
}

/** Chia số lượng nguyên theo trọng số (phần dư vào tờ có phần lẻ lớn nhất). */
export function splitIntegerByWeights(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  if (total <= 0) return weights.map(() => 0);
  const sumW = weights.reduce((a, b) => a + Math.max(0, b), 0) || weights.length;
  const raw = weights.map((w) => (total * Math.max(0, w)) / sumW);
  const out = raw.map((v) => Math.floor(v));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - out[i]! }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && k < order.length * 2; k++) {
    const idx = order[k % order.length]!.i;
    out[idx]! += 1;
    rem -= 1;
  }
  return out;
}

function declarationWeights(declarations: readonly InvoiceDeclaration[]): number[] {
  return declarations.map((d) => {
    if (d.targetPcs != null && d.targetPcs > 0) return d.targetPcs;
    if (d.targetKg != null && d.targetKg > 0) return d.targetKg;
    return 1;
  });
}

/** Phân bổ dòng mẫu sang mọi tờ theo tỷ lệ target kiện/kg. */
export function autoDistributeItemsToDeclarations(
  templateItems: readonly InvoiceLineItem[],
  declarations: readonly InvoiceDeclaration[]
): InvoiceDeclaration[] {
  if (declarations.length <= 1) return declarations.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it })) }));
  const weights = declarationWeights(declarations);
  return declarations.map((decl, declIdx) => ({
    ...decl,
    items: templateItems.map((tpl) => {
      const qtyParts = splitIntegerByWeights(tpl.quantity, weights);
      return cloneLineItem(tpl, { quantity: qtyParts[declIdx] ?? 0 });
    }),
  }));
}

/** Nhân cấu trúc tờ nguồn sang các tờ còn lại. */
export function applyTemplateStructure(
  declarations: readonly InvoiceDeclaration[],
  sourceDeclarationId: string,
  mode: "zero" | "scale"
): InvoiceDeclaration[] {
  const source = declarations.find((d) => d.id === sourceDeclarationId) ?? declarations[0];
  if (!source) return declarations.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it })) }));
  const templates = source.items;
  if (mode === "zero") {
    return declarations.map((d) => {
      if (d.id === source.id) return { ...d, items: templates.map((it) => ({ ...it })) };
      return { ...d, items: templates.map((it) => cloneLineItem(it, { quantity: 0 })) };
    });
  }
  return autoDistributeItemsToDeclarations(templates, declarations);
}

export function copyItemsToDeclaration(
  declarations: readonly InvoiceDeclaration[],
  fromDeclarationId: string,
  toDeclarationId: string,
  lineIds: readonly string[],
  mode: "append" | "replace"
): InvoiceDeclaration[] {
  const from = declarations.find((d) => d.id === fromDeclarationId);
  if (!from) return declarations.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it })) }));
  const picked =
    lineIds.length > 0
      ? from.items.filter((it) => lineIds.includes(it.lineId))
      : from.items;
  const cloned = picked.map((it) => cloneLineItem(it));
  return declarations.map((d) => {
    if (d.id !== toDeclarationId) return { ...d, items: d.items.map((it) => ({ ...it })) };
    if (mode === "replace") return { ...d, items: cloned };
    return { ...d, items: [...d.items, ...cloned] };
  });
}

export function copyItemsToAllOtherDeclarations(
  declarations: readonly InvoiceDeclaration[],
  fromDeclarationId: string,
  lineIds: readonly string[],
  mode: "append" | "replace"
): InvoiceDeclaration[] {
  return declarations.reduce(
    (acc, d) => {
      if (d.id === fromDeclarationId) return acc;
      return copyItemsToDeclaration(acc, fromDeclarationId, d.id, lineIds, mode);
    },
    declarations.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it })) }))
  );
}

/** Đếm dòng hàng HQ (ưu tiên invoiceDeclarations). */
export function countInvoiceLineItems(
  shipment: Pick<Shipment, "invoiceItems" | "invoiceDeclarations">
): number {
  const decls = shipment.invoiceDeclarations;
  if (Array.isArray(decls) && decls.length > 0) {
    return decls.reduce((n, d) => n + (d.items?.length ?? 0), 0);
  }
  return shipment.invoiceItems?.length ?? 0;
}

function splitEvenInteger(total: number, n: number): { base: number; remainder: number } {
  const base = Math.floor(total / n);
  return { base, remainder: total - base * (n - 1) };
}

function splitEvenKg(total: number, n: number): { base: number; remainder: number } {
  const base = Number((total / n).toFixed(1));
  return { base, remainder: Number((total - base * (n - 1)).toFixed(1)) };
}

function cloneItems(items: InvoiceLineItem[] | undefined): InvoiceLineItem[] {
  return (items ?? []).map((it) => ({ ...it }));
}

export function newDeclarationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `decl-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `decl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createInvoiceDeclaration(
  seq: number,
  total: number,
  items: InvoiceLineItem[] = [],
  targets?: { targetPcs?: number | null; targetKg?: number | null }
): InvoiceDeclaration {
  return {
    id: newDeclarationId(),
    label: total > 1 ? `Tờ ${seq}/${total}` : "Tờ 1",
    seq,
    items: cloneItems(items),
    targetPcs: targets?.targetPcs ?? null,
    targetKg: targets?.targetKg ?? null,
  };
}

/** Đọc tờ khai từ lô — tương thích dữ liệu cũ chỉ có invoiceItems. */
export function resolveInvoiceDeclarations(
  shipment: Pick<Shipment, "invoiceItems" | "invoiceDeclarations">
): InvoiceDeclaration[] {
  const raw = shipment.invoiceDeclarations;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((d, i) => ({
      id: d.id || newDeclarationId(),
      label: d.label?.trim() || `Tờ ${d.seq ?? i + 1}`,
      seq: d.seq ?? i + 1,
      items: cloneItems(d.items),
      targetPcs: d.targetPcs ?? null,
      targetKg: d.targetKg ?? null,
    }));
  }
  return [createInvoiceDeclaration(1, 1, shipment.invoiceItems ?? [])];
}

export function splitIntoDeclarations(
  count: number,
  existingItems: InvoiceLineItem[],
  shipmentPcs: number | null,
  shipmentKg: number | null
): InvoiceDeclaration[] {
  const n = Math.max(2, Math.min(20, Math.floor(count)));
  const pcsSplit =
    shipmentPcs != null && shipmentPcs > 0 ? splitEvenInteger(shipmentPcs, n) : null;
  const kgSplit = shipmentKg != null && shipmentKg > 0 ? splitEvenKg(shipmentKg, n) : null;

  return Array.from({ length: n }, (_, i) => {
    const seq = i + 1;
    const isLast = i === n - 1;
    return createInvoiceDeclaration(seq, n, i === 0 ? cloneItems(existingItems) : [], {
      targetPcs: pcsSplit != null ? (isLast ? pcsSplit.remainder : pcsSplit.base) : null,
      targetKg: kgSplit != null ? (isLast ? kgSplit.remainder : kgSplit.base) : null,
    });
  });
}

export function updateDeclarationItems(
  declarations: InvoiceDeclaration[],
  declarationId: string,
  items: InvoiceLineItem[]
): InvoiceDeclaration[] {
  return declarations.map((d) => (d.id === declarationId ? { ...d, items: cloneItems(items) } : d));
}

export function renumberDeclarationLabels(declarations: InvoiceDeclaration[]): InvoiceDeclaration[] {
  const total = declarations.length;
  return declarations.map((d, i) => ({
    ...d,
    seq: i + 1,
    label: total > 1 ? `Tờ ${i + 1}/${total}` : "Tờ 1",
  }));
}

export function addDeclaration(declarations: InvoiceDeclaration[]): InvoiceDeclaration[] {
  const next = [
    ...declarations,
    createInvoiceDeclaration(declarations.length + 1, declarations.length + 1),
  ];
  return renumberDeclarationLabels(next);
}

export function removeDeclaration(
  declarations: InvoiceDeclaration[],
  declarationId: string
): InvoiceDeclaration[] {
  if (declarations.length <= 1) return declarations;
  const filtered = declarations.filter((d) => d.id !== declarationId);
  return renumberDeclarationLabels(filtered);
}

export type DeclarationTargetsLock = {
  shipmentPcs: number | null;
  shipmentKg: number | null;
  assignedPcs: number;
  assignedKg: number;
  pcsOk: boolean;
  kgOk: boolean;
  pcsRemaining: number;
  kgRemaining: number;
};

export function summarizeDeclarationTargets(
  declarations: readonly InvoiceDeclaration[]
): { assignedPcs: number; assignedKg: number } {
  let assignedPcs = 0;
  let assignedKg = 0;
  for (const d of declarations) {
    if (d.targetPcs != null && d.targetPcs > 0) assignedPcs += d.targetPcs;
    if (d.targetKg != null && d.targetKg > 0) assignedKg += Number(d.targetKg);
  }
  return { assignedPcs, assignedKg: Number(assignedKg.toFixed(1)) };
}

/** Kiểm tra tổng target mọi tờ vs lô hàng. */
export function validateDeclarationTargets(
  declarations: readonly InvoiceDeclaration[],
  shipmentPcs: number | null,
  shipmentKg: number | null
): DeclarationTargetsLock {
  const { assignedPcs, assignedKg } = summarizeDeclarationTargets(declarations);
  const pcsRemaining =
    shipmentPcs != null && shipmentPcs > 0 ? shipmentPcs - assignedPcs : 0;
  const kgRemaining =
    shipmentKg != null && shipmentKg > 0
      ? Number((shipmentKg - assignedKg).toFixed(1))
      : 0;
  const pcsOk = shipmentPcs == null || shipmentPcs <= 0 || Math.abs(pcsRemaining) < 1e-3;
  const kgOk = shipmentKg == null || shipmentKg <= 0 || Math.abs(kgRemaining) < 0.05;
  return {
    shipmentPcs,
    shipmentKg,
    assignedPcs,
    assignedKg,
    pcsOk,
    kgOk,
    pcsRemaining,
    kgRemaining,
  };
}

export function updateDeclarationTargets(
  declarations: InvoiceDeclaration[],
  declarationId: string,
  patch: { targetPcs?: number | null; targetKg?: number | null }
): InvoiceDeclaration[] {
  return declarations.map((d) => {
    if (d.id !== declarationId) return d;
    return {
      ...d,
      targetPcs:
        patch.targetPcs !== undefined
          ? patch.targetPcs == null || patch.targetPcs <= 0
            ? null
            : Math.round(patch.targetPcs)
          : d.targetPcs,
      targetKg:
        patch.targetKg !== undefined
          ? patch.targetKg == null || patch.targetKg <= 0
            ? null
            : Math.round(Number(patch.targetKg))
          : d.targetKg,
    };
  });
}

/** Chia đều kiện/kg lô cho mọi tờ (giữ hàng hiện tại). */
export function redistributeTargetsEvenly(
  declarations: readonly InvoiceDeclaration[],
  shipmentPcs: number | null,
  shipmentKg: number | null
): InvoiceDeclaration[] {
  const n = declarations.length;
  if (n === 0) return [];
  const pcsSplit =
    shipmentPcs != null && shipmentPcs > 0 ? splitEvenInteger(shipmentPcs, n) : null;
  const kgSplit = shipmentKg != null && shipmentKg > 0 ? splitEvenKg(shipmentKg, n) : null;

  return declarations.map((d, i) => {
    const isLast = i === n - 1;
    return {
      ...d,
      targetPcs: pcsSplit != null ? (isLast ? pcsSplit.remainder : pcsSplit.base) : d.targetPcs,
      targetKg: kgSplit != null ? (isLast ? kgSplit.remainder : kgSplit.base) : d.targetKg,
    };
  });
}
