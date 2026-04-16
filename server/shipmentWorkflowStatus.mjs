/**
 * Giữ đồng bộ với `src/utils/shipmentWorkflowStatus.ts` (derive + patch tự động).
 * Node server không import TS — khi đổi quy tắc, cập nhật cả hai file.
 */

function awbDigits(awb) {
  return String(awb || "").replace(/\D/g, "");
}

export function deriveAutoWorkflowStatus(row) {
  const awbOk = awbDigits(row.awb).length === 11;
  const pcsOk = row.pcs != null && row.pcs > 0;
  const dimOk =
    (row.dimWeightKg != null && Number.isFinite(row.dimWeightKg)) ||
    (Array.isArray(row.dimLines) && row.dimLines.length > 0);
  if (dimOk && pcsOk && awbOk) return "VOLUME_DONE";
  if (pcsOk && awbOk) return "RECEIVED";
  return "PENDING";
}

export function isAutoWorkflowStatus(s) {
  return s === "PENDING" || s === "RECEIVED" || s === "VOLUME_DONE";
}

const ORDER = [
  "PENDING",
  "RECEIVED",
  "VOLUME_DONE",
  "CUSTOMS",
  "SECURITY",
  "OLA_PULL",
  "WEIGH_SLIP",
  "COMPLETED",
];

const MANUAL = new Set(["CUSTOMS", "SECURITY", "OLA_PULL", "WEIGH_SLIP", "COMPLETED"]);

const LEGACY_MAP = {
  AT_RISK: "RECEIVED",
  CUTOFF_PASSED: "RECEIVED",
  BUILT_UP: "WEIGH_SLIP",
  DEPARTED: "OLA_PULL",
  DELIVERED: "COMPLETED",
};

export function migrateShipmentStatus(row) {
  const raw = String(row.status ?? "");
  let s = LEGACY_MAP[raw] || raw;
  if (!ORDER.includes(s)) s = "PENDING";
  if (MANUAL.has(s)) return s;
  return deriveAutoWorkflowStatus(row);
}

const DATA_FIELDS = ["awb", "pcs", "dimWeightKg", "dimLines", "dimDivisor"];

export function workflowStatusPatchFromDataEdit(prev, patch, merged) {
  const touchesData = DATA_FIELDS.some((k) => patch[k] !== undefined);
  if (!touchesData) return {};
  if (patch.status !== undefined) return {};
  if (!isAutoWorkflowStatus(prev.status)) return {};
  const next = deriveAutoWorkflowStatus(merged);
  if (next === merged.status) return {};
  return { status: next };
}
