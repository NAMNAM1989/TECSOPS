import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { findCustomerEntry } from "./customerBookingResolve";
import { normalizeVehiclePlateInput } from "./vehiclePlateNormalize";

/** Tra khách theo lô (id → mã → tên). */
export function findCustomerByShipment(
  row: Pick<Shipment, "customerId" | "customerCode" | "customer">,
  directory: readonly CustomerDirectoryEntry[]
): CustomerDirectoryEntry | undefined {
  return findCustomerEntry(row as Shipment, directory);
}

/** Chuẩn hóa biển số (uppercase, bỏ ký tự lạ). */
export function formatVehicleLicensePlate(raw: string): string {
  return normalizeVehiclePlateInput(raw);
}
