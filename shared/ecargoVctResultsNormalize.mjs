/**
 * Kết quả đăng ký eCargo VCT — store sync Ops.
 */

function clip(s, max) {
  return String(s ?? "").trim().slice(0, max);
}

export const ECARGO_VCT_STATUSES = new Set([
  "pending",
  "otp",
  "done",
  "error",
]);

export function emptyEcargoVctResultsStore() {
  return { byShipmentId: {}, updatedAt: "" };
}

export function normalizeEcargoVctResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const status = String(raw.status || "").trim().toLowerCase();
  if (!ECARGO_VCT_STATUSES.has(status)) return null;
  const qr = clip(raw.qrDataUrl, 400_000);
  return {
    status,
    vctCode: clip(raw.vctCode, 80),
    qrDataUrl: qr.startsWith("data:image") || qr.startsWith("http") ? qr : "",
    registeredAt: clip(raw.registeredAt, 40),
    error: clip(raw.error, 500),
    awb: clip(raw.awb, 32),
  };
}

export function normalizeEcargoVctResultsStore(raw) {
  const out = emptyEcargoVctResultsStore();
  if (!raw || typeof raw !== "object") return out;
  const src =
    raw.byShipmentId && typeof raw.byShipmentId === "object"
      ? raw.byShipmentId
      : {};
  for (const [id, v] of Object.entries(src)) {
    const key = clip(id, 80);
    if (!key) continue;
    const n = normalizeEcargoVctResult(v);
    if (n) out.byShipmentId[key] = n;
  }
  out.updatedAt = clip(raw.updatedAt, 40) || new Date().toISOString();
  return out;
}
