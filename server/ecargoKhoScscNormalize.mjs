/** @typedef {{ vehicleInput: string, driverName?: string, driverId?: string, arrivalDate?: string, arrivalTimeSlot?: string, vehicleType?: string, markedSubmitted?: boolean, updatedAt?: string }} EcargoLine */

const ECARGO_VEHICLE_TYPES = new Set(["Ô tô", "Xe máy", "Xe ba gác", "Đi bộ"]);
const ARRIVAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} raw */
function clampEcargoVehicleType(raw) {
  const s = String(raw ?? "").trim();
  return ECARGO_VEHICLE_TYPES.has(s) ? s : undefined;
}

/** @param {unknown} raw */
function clampEcargoArrivalDate(raw) {
  const s = String(raw ?? "").trim();
  return ARRIVAL_DATE_RE.test(s) ? s : undefined;
}

/** @param {unknown} raw */
function clampEcargoArrivalTimeSlot(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(s)) return undefined;
  return s.replace(/\s+/g, " ");
}

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
  const driverName = typeof o.driverName === "string" ? o.driverName.trim().slice(0, 120) : undefined;
  const driverId = typeof o.driverId === "string" ? o.driverId.replace(/\D/g, "").slice(0, 20) : undefined;
  const arrivalDate = clampEcargoArrivalDate(o.arrivalDate);
  const arrivalTimeSlot = clampEcargoArrivalTimeSlot(o.arrivalTimeSlot);
  const vehicleType = clampEcargoVehicleType(o.vehicleType);
  const markedSubmitted = o.markedSubmitted === true;
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt.trim() ? o.updatedAt.trim() : undefined;
  if (!vehicleInput && !markedSubmitted) return null;
  return {
    vehicleInput,
    ...(driverName ? { driverName } : {}),
    ...(driverId ? { driverId } : {}),
    ...(arrivalDate ? { arrivalDate } : {}),
    ...(arrivalTimeSlot ? { arrivalTimeSlot } : {}),
    ...(vehicleType ? { vehicleType } : {}),
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
