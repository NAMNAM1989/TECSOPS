import type { LabelDocumentKind, LabelObject, LabelTemplateV1 } from "./types";
import { LABEL_TEMPLATE_VERSION } from "./types";

const KINDS: LabelDocumentKind[] = [
  "thermal-cargo-100x80",
  "thermal-cargo-100x50",
  "scsc-weigh-a4",
];

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeLabelTemplateLoose(raw: unknown): LabelTemplateV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.version !== LABEL_TEMPLATE_VERSION) return undefined;
  const kind = KINDS.includes(o.documentKind as LabelDocumentKind)
    ? (o.documentKind as LabelDocumentKind)
    : "thermal-cargo-100x80";
  const pageRaw = (o.page as Record<string, unknown>) ?? {};
  const objects = Array.isArray(o.objects) ? (o.objects as LabelObject[]).slice(0, 200) : [];
  return {
    version: 1,
    id: String(o.id ?? "tpl").slice(0, 80),
    name: String(o.name ?? "Template").slice(0, 120),
    documentKind: kind,
    unit: "mm",
    page: {
      width: num(pageRaw.width, 10, 300, 100),
      height: num(pageRaw.height, 10, 400, 80),
      dpi: num(pageRaw.dpi, 150, 600, 203),
      rotation: [0, 90, 180, 270].includes(pageRaw.rotation as number)
        ? (pageRaw.rotation as 0 | 90 | 180 | 270)
        : 0,
      background: typeof pageRaw.background === "string" ? pageRaw.background.slice(0, 32) : undefined,
    },
    objects,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    designerActive: undefined,
  };
}
