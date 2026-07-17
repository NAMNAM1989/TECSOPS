/**
 * Thin typed wrapper — logic thật ở `shared/shipmentWorkflowStatus.mjs`.
 */
import type { Shipment, ShipmentStatus } from "../types/shipment";
import * as core from "../../shared/shipmentWorkflowStatus.mjs";

export const SHIPMENT_STATUS_ORDER = core.SHIPMENT_STATUS_ORDER as ShipmentStatus[];

export function isAutoWorkflowStatus(s: ShipmentStatus): boolean {
  return core.isAutoWorkflowStatus(s);
}

export function deriveAutoWorkflowStatus(
  row: Pick<Shipment, "awb" | "pcs" | "dimWeightKg" | "dimLines">
): ShipmentStatus {
  return core.deriveAutoWorkflowStatus(row) as ShipmentStatus;
}

export function migrateShipmentStatus(
  row: Pick<Shipment, "status" | "awb" | "pcs" | "dimWeightKg" | "dimLines">
): ShipmentStatus {
  return core.migrateShipmentStatus(row) as ShipmentStatus;
}

export function workflowStatusPatchFromDataEdit(
  prev: Shipment,
  patch: Partial<Shipment>,
  merged: Shipment
): Partial<Shipment> {
  return core.workflowStatusPatchFromDataEdit(prev, patch, merged) as Partial<Shipment>;
}
