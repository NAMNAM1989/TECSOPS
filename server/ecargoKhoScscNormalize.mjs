/** @typedef {{ vehicleInput: string, markedSubmitted?: boolean, updatedAt?: string }} EcargoLine */

/** @param {string} raw */
export function normalizeEcargoVehicleInput(raw) {
  return String(raw ?? "")
    .toUpperCase()
    .split("")
    .filter((c) => /[A-Z0-9;]/.test(c))
    .join("");
}

/** @param {unknown} raw @returns {EcargoLine | null} */
export function clampEcargoKhoScscLine(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const vehicleInput = normalizeEcargoVehicleInput(o.vehicleInput);
  const markedSubmitted = o.markedSubmitted === true;
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt.trim() ? o.updatedAt.trim() : undefined;
  if (!vehicleInput && !markedSubmitted) return null;
  return {
    vehicleInput,
    ...(markedSubmitted ? { markedSubmitted: true } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/** @param {unknown} raw @returns {Record<string, EcargoLine>} */
export function normalizeEcargoKhoScscMapLoose(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, EcargoLine>} */
  const out = {};
  for (const [id, line] of Object.entries(raw)) {
    if (typeof id !== "string" || !id.trim()) continue;
    const clamped = clampEcargoKhoScscLine(line);
    if (clamped) out[id] = clamped;
  }
  return out;
}
