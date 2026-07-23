import type { Shipment } from "../types/shipment";

/** Một nguồn mặc định cho payload Điền và file Excel rà soát ESID. */
export const ESID_DEFAULT_PAYMENT_MODE = "Chuyển khoản/Bank transfer";

export function esidTotalHawbs(s: Pick<Shipment, "hawb">): number {
  return (s.hawb || "").trim() ? 1 : 0;
}
