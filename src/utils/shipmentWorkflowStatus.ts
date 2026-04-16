import type { Shipment, ShipmentStatus } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";

/** Thứ tự hiển thị / lọc — 3 bước tự động, sau đó 5 bước NV chọn. */
export const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = [
  "PENDING",
  "RECEIVED",
  "VOLUME_DONE",
  "CUSTOMS",
  "SECURITY",
  "OLA_PULL",
  "WEIGH_SLIP",
  "COMPLETED",
];

const MANUAL: ShipmentStatus[] = ["CUSTOMS", "SECURITY", "OLA_PULL", "WEIGH_SLIP", "COMPLETED"];

const LEGACY_MAP: Partial<Record<string, ShipmentStatus>> = {
  AT_RISK: "RECEIVED",
  CUTOFF_PASSED: "RECEIVED",
  BUILT_UP: "WEIGH_SLIP",
  DEPARTED: "OLA_PULL",
  DELIVERED: "COMPLETED",
};

export function isAutoWorkflowStatus(s: ShipmentStatus): boolean {
  return s === "PENDING" || s === "RECEIVED" || s === "VOLUME_DONE";
}

export function deriveAutoWorkflowStatus(
  row: Pick<Shipment, "awb" | "pcs" | "dimWeightKg" | "dimLines">
): ShipmentStatus {
  const awbOk = awbDigitsKey(row.awb).length === 11;
  const pcsOk = row.pcs != null && row.pcs > 0;
  const dimOk =
    (row.dimWeightKg != null && Number.isFinite(row.dimWeightKg)) ||
    (Array.isArray(row.dimLines) && row.dimLines.length > 0);
  if (dimOk && pcsOk && awbOk) return "VOLUME_DONE";
  if (pcsOk && awbOk) return "RECEIVED";
  return "PENDING";
}

/** Chuẩn hóa status khi đọc từ storage/API (legacy + bám dữ liệu cho nhánh tự động). */
export function migrateShipmentStatus(
  row: Pick<Shipment, "status" | "awb" | "pcs" | "dimWeightKg" | "dimLines">
): ShipmentStatus {
  const raw = String(row.status ?? "");
  let s = (LEGACY_MAP[raw] ?? raw) as ShipmentStatus;
  if (!SHIPMENT_STATUS_ORDER.includes(s)) s = "PENDING";
  if (MANUAL.includes(s)) return s;
  return deriveAutoWorkflowStatus(row);
}

const DATA_FIELDS: (keyof Shipment)[] = ["awb", "pcs", "dimWeightKg", "dimLines", "dimDivisor"];

/** Khi sửa AWB/kiện/DIM: tự cập nhật trạng thái nếu đang ở nhánh tự động và không gửi `status` trong patch. */
export function workflowStatusPatchFromDataEdit(
  prev: Shipment,
  patch: Partial<Shipment>,
  merged: Shipment
): Partial<Shipment> {
  const touchesData = DATA_FIELDS.some((k) => patch[k] !== undefined);
  if (!touchesData) return {};
  if (patch.status !== undefined) return {};
  if (!isAutoWorkflowStatus(prev.status)) return {};
  const next = deriveAutoWorkflowStatus(merged);
  if (next === merged.status) return {};
  return { status: next };
}
