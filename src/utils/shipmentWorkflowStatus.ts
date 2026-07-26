/**
 * Thin typed wrapper — logic thật ở `shared/shipmentWorkflowStatus.mjs`.
 */
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import * as core from "../../shared/shipmentWorkflowStatus.mjs";

export const SHIPMENT_STATUS_ORDER = core.SHIPMENT_STATUS_ORDER as ShipmentStatus[];

export const WORKFLOW_BY_WAREHOUSE = core.WORKFLOW_BY_WAREHOUSE as Record<Warehouse, ShipmentStatus[]>;

export const FILTER_HIDDEN_STATUSES = core.FILTER_HIDDEN_STATUSES as ReadonlySet<ShipmentStatus>;

export function statusOrderForWarehouse(warehouse: Warehouse): ShipmentStatus[] {
  return core.statusOrderForWarehouse(warehouse) as ShipmentStatus[];
}

export function statusOrderForFilter(warehouse: Warehouse | "ALL" | null | undefined): ShipmentStatus[] {
  return core.statusOrderForFilter(warehouse) as ShipmentStatus[];
}

export function selectableStatusesForShipment(
  warehouse: Warehouse,
  currentStatus: ShipmentStatus
): ShipmentStatus[] {
  return core.selectableStatusesForShipment(warehouse, currentStatus) as ShipmentStatus[];
}

export function isStatusInWarehouseWorkflow(status: ShipmentStatus, warehouse: Warehouse): boolean {
  return core.isStatusInWarehouseWorkflow(status, warehouse) as boolean;
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
