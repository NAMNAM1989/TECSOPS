export const SHIPMENT_STATUS_ORDER: string[];
export function isAutoWorkflowStatus(s: string): boolean;
export function deriveAutoWorkflowStatus(row: {
  awb?: string;
  pcs?: number | null;
  dimWeightKg?: number | null;
  dimLines?: unknown[] | null;
}): string;
export function migrateShipmentStatus(row: {
  status?: string;
  awb?: string;
  pcs?: number | null;
  dimWeightKg?: number | null;
  dimLines?: unknown[] | null;
}): string;
export function workflowStatusPatchFromDataEdit(
  prev: { status?: string },
  patch: Record<string, unknown>,
  merged: { status?: string; awb?: string; pcs?: number | null; dimWeightKg?: number | null; dimLines?: unknown[] | null }
): { status?: string };
