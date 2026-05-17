/** Đồng bộ `normalizeLabelTemplateLoose` (client). */

const KINDS = new Set(["thermal-cargo-100x80", "thermal-cargo-100x50", "scsc-weigh-a4"]);

function num(v, min, max, fallback) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** @param {unknown} raw */
export function normalizeLabelTemplateLoose(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  if (raw.version !== 1) return undefined;
  const kind = KINDS.has(raw.documentKind) ? raw.documentKind : "thermal-cargo-100x80";
  const pageRaw = raw.page && typeof raw.page === "object" ? raw.page : {};
  const objects = Array.isArray(raw.objects) ? raw.objects.slice(0, 200) : [];
  return {
    version: 1,
    id: String(raw.id ?? "tpl").slice(0, 80),
    name: String(raw.name ?? "Template").slice(0, 120),
    documentKind: kind,
    unit: "mm",
    page: {
      width: num(pageRaw.width, 10, 300, 100),
      height: num(pageRaw.height, 10, 400, 80),
      dpi: num(pageRaw.dpi, 150, 600, 203),
      rotation: [0, 90, 180, 270].includes(pageRaw.rotation) ? pageRaw.rotation : 0,
      background:
        typeof pageRaw.background === "string" ? pageRaw.background.slice(0, 32) : undefined,
    },
    objects,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    /** Không lưu cờ cũ — preview tem luôn dùng layout CSS gốc trên client. */
    designerActive: undefined,
  };
}
