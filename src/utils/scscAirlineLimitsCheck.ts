import type { DimPieceLine } from "./volumetricDim";
import { resolveScscAirlineDimRule, type ScscAirlineDimRule } from "./scscChargeableWeight";

export type ScscDimLimitWarning = {
  kind: "dims" | "note";
  message: string;
};

function sorted3(a: number, b: number, c: number): [number, number, number] {
  return [a, b, c].sort((x, y) => y - x) as [number, number, number];
}

/** Kiện vượt max dims (so 3 cạnh đã sắp giảm dần — không phụ thuộc hướng đo). */
export function lineExceedsMaxDims(
  line: DimPieceLine,
  max: { l: number; w: number; h: number }
): boolean {
  const p = sorted3(line.lCm, line.wCm, line.hCm);
  const m = sorted3(max.l, max.w, max.h);
  return p[0] > m[0] + 1e-6 || p[1] > m[1] + 1e-6 || p[2] > m[2] + 1e-6;
}

export function collectScscDimLimitWarnings(
  flight: string,
  awb: string,
  lines: DimPieceLine[]
): ScscDimLimitWarning[] {
  const rule = resolveScscAirlineDimRule(flight, awb);
  if (!rule || lines.length === 0) return [];

  const out: ScscDimLimitWarning[] = [];
  if (rule.maxDimsCm) {
    const bad = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => lineExceedsMaxDims(line, rule.maxDimsCm!));
    if (bad.length > 0) {
      const { l, w, h } = rule.maxDimsCm;
      const sample = bad
        .slice(0, 3)
        .map(({ line, i }) => `#${i + 1} ${line.lCm}×${line.wCm}×${line.hCm}`)
        .join("; ");
      out.push({
        kind: "dims",
        message: `Vượt Max dims ${l}×${w}×${h} cm (${rule.codes.join("/")}) — ${sample}${
          bad.length > 3 ? ` … (+${bad.length - 3})` : ""
        }`,
      });
    }
  }
  if (rule.limitsNote) {
    out.push({ kind: "note", message: rule.limitsNote });
  } else if (rule.maxPieceKg != null) {
    out.push({
      kind: "note",
      message: `Max weight / kiện (tài liệu): ${rule.maxPieceKg} kg — kiểm tra gross thực tế`,
    });
  }
  return out;
}

export function scscRuleLabel(rule: ScscAirlineDimRule | null): string {
  if (!rule) return "";
  return `${rule.codes.join("/")} · ${rule.chargeableNote}`;
}
