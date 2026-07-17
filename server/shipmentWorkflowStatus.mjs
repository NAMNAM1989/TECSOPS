/** Re-export — nguồn sự thật: `shared/shipmentWorkflowStatus.mjs`. */
export {
  SHIPMENT_STATUS_ORDER,
  isAutoWorkflowStatus,
  deriveAutoWorkflowStatus,
  migrateShipmentStatus,
  workflowStatusPatchFromDataEdit,
} from "../shared/shipmentWorkflowStatus.mjs";
