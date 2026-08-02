/**
 * Quy tắc trạng thái lô — nguồn sự thật server + client.
 * Không nhân bản logic ở src/utils hay server/.
 *
 * Enum lưu DB giữ nguyên (kể cả CUSTOMS/SECURITY/COMPLETED lịch sử).
 * Luồng chọn/filter theo kho — xem WORKFLOW_BY_WAREHOUSE.
 */

import { awbDigitsKey } from "./awbFormat.mjs";

/** Toàn bộ mã từng tồn tại — dùng migrate / validate storage. */
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

/**
 * Workflow theo kho (spec §5.6).
 * TCS: Booking → Nhận hàng → Đã đo Volume → Kéo OLA → Hoàn thành tiếp nhận → Nộp tờ cân
 * SCSC: Booking → Nhận hàng → Đã đo Volume → Kéo OLA → Nộp tờ cân
 */
const WORKFLOW_TCS = ["PENDING", "RECEIVED", "VOLUME_DONE", "OLA_PULL", "RECEPTION_COMPLETED", "WEIGH_SLIP"];
const WORKFLOW_SCSC = ["PENDING", "RECEIVED", "VOLUME_DONE", "OLA_PULL", "WEIGH_SLIP"];

export const WORKFLOW_BY_WAREHOUSE = {
  "TECS-TCS": WORKFLOW_TCS,
  TCS: WORKFLOW_TCS,
  "TECS-SCSC": WORKFLOW_SCSC,
  SCSC: WORKFLOW_SCSC,
};

/** Ẩn khỏi filter (lịch sử / ngoài luồng hiện tại). */
export const FILTER_HIDDEN_STATUSES = new Set(["CUSTOMS", "SECURITY", "COMPLETED"]);

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

export function statusOrderForWarehouse(warehouse) {
  return WORKFLOW_BY_WAREHOUSE[warehouse] || WORKFLOW_BY_WAREHOUSE["TECS-TCS"];
}

/** Chip filter: theo kho đang xem; ALL = union (thứ tự TCS — bao gồm Hoàn thành tiếp nhận). */
export function statusOrderForFilter(warehouse) {
  if (warehouse && WORKFLOW_BY_WAREHOUSE[warehouse]) {
    return statusOrderForWarehouse(warehouse);
  }
  return WORKFLOW_BY_WAREHOUSE["TECS-TCS"];
}

/** Option StatusSelect: luồng kho + giữ mã lịch sử nếu đang gắn trên lô. */
export function selectableStatusesForShipment(warehouse, currentStatus) {
  const order = statusOrderForWarehouse(warehouse);
  if (currentStatus && !order.includes(currentStatus)) {
    return [currentStatus, ...order];
  }
  return order;
}

export function isStatusInWarehouseWorkflow(status, warehouse) {
  return statusOrderForWarehouse(warehouse).includes(status);
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
