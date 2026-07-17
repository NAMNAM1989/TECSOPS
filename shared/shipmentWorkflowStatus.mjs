/**
 * Quy tắc trạng thái lô — nguồn sự thật server + client.
 * Không nhân bản logic ở src/utils hay server/.
 */

import { awbDigitsKey } from "./awbFormat.mjs";

export const SHIPMENT_STATUS_ORDER = [
  "PENDING",
  "RECEIVED",
  "VOLUME_DONE",
  "CUSTOMS",
  "SECURITY",
  "OLA_PULL",
  "RECEPTION_COMPLETED",
  "WEIGH_SLIP",
  "COMPLETED",
];

const MANUAL = new Set([
  "CUSTOMS",
  "SECURITY",
  "OLA_PULL",
  "RECEPTION_COMPLETED",
  "WEIGH_SLIP",
  "COMPLETED",
]);

const LEGACY_MAP = {
  AT_RISK: "RECEIVED",
  CUTOFF_PASSED: "RECEIVED",
  BUILT_UP: "WEIGH_SLIP",
  DEPARTED: "OLA_PULL",
  DELIVERED: "COMPLETED",
};

const DATA_FIELDS = ["awb", "pcs", "dimWeightKg", "dimLines", "dimDivisor"];

export function isAutoWorkflowStatus(s) {
  return s === "PENDING" || s === "RECEIVED" || s === "VOLUME_DONE";
}

export function deriveAutoWorkflowStatus(row) {
  const awbOk = awbDigitsKey(row.awb).length === 11;
  const pcsOk = row.pcs != null && row.pcs > 0;
  const dimOk =
    (row.dimWeightKg != null && Number.isFinite(row.dimWeightKg)) ||
    (Array.isArray(row.dimLines) && row.dimLines.length > 0);
  if (dimOk && pcsOk && awbOk) return "VOLUME_DONE";
  if (pcsOk && awbOk) return "RECEIVED";
  return "PENDING";
}

export function migrateShipmentStatus(row) {
  const raw = String(row.status ?? "");
  let s = LEGACY_MAP[raw] || raw;
  if (!SHIPMENT_STATUS_ORDER.includes(s)) s = "PENDING";
  if (MANUAL.has(s)) return s;
  return deriveAutoWorkflowStatus(row);
}

export function workflowStatusPatchFromDataEdit(prev, patch, merged) {
  const touchesData = DATA_FIELDS.some((k) => patch[k] !== undefined);
  if (!touchesData) return {};
  if (patch.status !== undefined) return {};
  if (!isAutoWorkflowStatus(prev.status)) return {};
  const next = deriveAutoWorkflowStatus(merged);
  if (next === merged.status) return {};
  return { status: next };
}
