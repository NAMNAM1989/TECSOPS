import type { ScscH21InvoiceDeclaration, ScscH21InvoiceLine } from "../types/scscH21Catalog";
import type { Shipment } from "../types/shipment";
import {
  clampScscH21InvoiceDeclarations,
  clampScscH21InvoiceLines,
} from "../../shared/scscH21CatalogNormalize.mjs";

export type H21CargoFamilyMode =
  | "auto"
  | "frozen"
  | "fruit"
  | "food"
  | "garment"
  | "general";

/** Draft UI cho một tờ khai trên modal H21. */
export type H21DeclSplit = {
  id: string;
  kgDraft: string;
  lineCountDraft: string;
  /** Tổng số kiện (Total carton) — nhập tay. */
  pcsDraft: string;
  /** INV NO — nhập tay (ưu tiên). */
  invoiceNoDraft: string;
  cargoFamilyMode: H21CargoFamilyMode;
  lines: ScscH21InvoiceLine[];
};

export function roundH21Kg(n: number): number {
  return Math.max(0, Math.round(n * 1000) / 1000);
}

export function normalizeLineCountDraft(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "15";
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return "15";
  return String(Math.min(50, Math.max(1, n)));
}

export function parseLineCountFromDraft(draft: string): number {
  return Number(normalizeLineCountDraft(draft));
}

export function normalizePcsDraft(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.min(999_999, Math.max(1, n)));
}

export function parsePcsFromDraft(draft: string): number {
  const n = parseInt(String(draft ?? "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(999_999, Math.max(1, Math.round(n)));
}

/** Gợi ý số kiện theo tỉ lệ KG tờ khai / KG lô. */
export function suggestDeclarationPcs(
  declarationKg: number,
  lotKg: number,
  lotPcs: number
): number {
  if (lotPcs <= 0) return 0;
  if (declarationKg > 0 && lotKg > 0) {
    return Math.max(1, Math.round((declarationKg / lotKg) * lotPcs));
  }
  return Math.max(1, Math.round(lotPcs));
}

export function parseAllocateKgFromDraft(draft: string, lotKg: number): number {
  const trimmed = draft.trim().replace(",", ".");
  if (!trimmed) return 0;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (lotKg > 0) return Math.min(n, lotKg);
  return n;
}

function newSplitId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `decl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDeclSplit(
  kgDraft: string,
  extra?: Partial<H21DeclSplit>
): H21DeclSplit {
  return {
    id: newSplitId(),
    kgDraft,
    lineCountDraft: "15",
    pcsDraft: "",
    invoiceNoDraft: "",
    cargoFamilyMode: "auto",
    lines: [],
    ...extra,
  };
}

/** Fingerprint nhẹ để so dirty (không phụ thuộc thứ tự object key lạ). */
export function fingerprintH21Splits(
  splits: readonly H21DeclSplit[],
  shipperId: string
): string {
  const payload = {
    shipperId: shipperId.trim(),
    splits: splits.map((s) => ({
      id: s.id,
      kg: parseAllocateKgFromDraft(s.kgDraft, 0) || s.kgDraft.trim(),
      lineCountDraft: normalizeLineCountDraft(s.lineCountDraft),
      pcsDraft: normalizePcsDraft(s.pcsDraft),
      invoiceNoDraft: String(s.invoiceNoDraft ?? "").trim().slice(0, 80),
      cargoFamilyMode: s.cargoFamilyMode,
      lines: s.lines.map((l) => ({
        id: l.id,
        catalogItemId: l.catalogItemId ?? null,
        description: l.description,
        hsCode: l.hsCode,
        origin: l.origin,
        quantity: l.quantity,
        uom: l.uom,
        weightKg: l.weightKg,
        unitPrice: l.unitPrice,
        amount: l.amount,
      })),
    })),
  };
  return JSON.stringify(payload);
}

export function hydrateSplitsFromShipment(shipment: Shipment): H21DeclSplit[] {
  const lotKg = shipment.kg ?? 0;
  const lotPcs = shipment.pcs ?? 0;
  const decls = clampScscH21InvoiceDeclarations(
    shipment.invoiceDeclarations
  ) as ScscH21InvoiceDeclaration[];
  if (decls.length) {
    return decls.map((d) => {
      const kg = d.declarationKg > 0 ? d.declarationKg : 0;
      const savedPcs = d.declarationPcs > 0 ? d.declarationPcs : 0;
      const suggested = suggestDeclarationPcs(kg, lotKg, lotPcs);
      return createDeclSplit(kg > 0 ? String(kg) : "", {
        id: d.id,
        cargoFamilyMode: d.cargoFamilyMode,
        lines: d.lines as ScscH21InvoiceLine[],
        lineCountDraft: d.lines.length ? String(d.lines.length) : "15",
        pcsDraft: savedPcs > 0 ? String(savedPcs) : suggested > 0 ? String(suggested) : "",
        invoiceNoDraft: String(d.invoiceNo ?? "").trim(),
      });
    });
  }
  const legacy = clampScscH21InvoiceLines(shipment.invoiceItems) as ScscH21InvoiceLine[];
  const legacyKg = shipment.kg != null ? Number(shipment.kg) : 0;
  const suggested = suggestDeclarationPcs(legacyKg, lotKg, lotPcs);
  return [
    createDeclSplit(shipment.kg != null ? String(shipment.kg) : "", {
      lines: legacy,
      lineCountDraft: legacy.length ? String(legacy.length) : "15",
      pcsDraft: suggested > 0 ? String(suggested) : "",
    }),
  ];
}

export function splitsToDeclarations(
  splits: readonly H21DeclSplit[],
  lotKg: number
): ScscH21InvoiceDeclaration[] {
  return clampScscH21InvoiceDeclarations(
    splits.map((s, i) => ({
      id: s.id,
      seq: i + 1,
      declarationKg: parseAllocateKgFromDraft(s.kgDraft, lotKg),
      declarationPcs: parsePcsFromDraft(s.pcsDraft),
      invoiceNo: String(s.invoiceNoDraft ?? "").trim().slice(0, 80),
      cargoFamilyMode: s.cargoFamilyMode,
      lines: s.lines,
    }))
  ) as ScscH21InvoiceDeclaration[];
}

/** Chỉ tờ có dòng hàng — payload lưu DB. */
export function declarationsReadyToSave(
  splits: readonly H21DeclSplit[],
  lotKg: number
): {
  declarations: ScscH21InvoiceDeclaration[];
  skippedEmpty: number;
} {
  const all = splitsToDeclarations(splits, lotKg);
  const withLines = all.filter((d) => d.lines.length > 0);
  // Resequence sau khi bỏ tờ trống (INV -1/-2 theo tờ đã lưu).
  const declarations = clampScscH21InvoiceDeclarations(withLines) as ScscH21InvoiceDeclaration[];
  return {
    declarations,
    skippedEmpty: Math.max(0, splits.length - declarations.length),
  };
}

export function sumAllocatedKg(splits: readonly H21DeclSplit[], lotKg: number): number {
  return roundH21Kg(
    splits.reduce((sum, s) => sum + parseAllocateKgFromDraft(s.kgDraft, lotKg), 0)
  );
}
