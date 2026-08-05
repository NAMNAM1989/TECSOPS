import {
  emptyEcargoVctResultsStore,
  normalizeEcargoVctResultsStore,
} from "../../shared/ecargoVctResultsNormalize.mjs";

export type EcargoVctStatus = "pending" | "otp" | "done" | "error";

export type EcargoVctResult = {
  status: EcargoVctStatus;
  vctCode: string;
  qrDataUrl: string;
  registeredAt: string;
  error: string;
  awb: string;
};

export type EcargoVctResultsStoreV1 = {
  byShipmentId: Record<string, EcargoVctResult>;
  updatedAt: string;
};

export { emptyEcargoVctResultsStore, normalizeEcargoVctResultsStore };

export function getEcargoVctResultForShipment(
  store: EcargoVctResultsStoreV1 | undefined | null,
  shipmentId: string
): EcargoVctResult | null {
  if (!store?.byShipmentId || !shipmentId) return null;
  return (store.byShipmentId[shipmentId] as EcargoVctResult | undefined) || null;
}
