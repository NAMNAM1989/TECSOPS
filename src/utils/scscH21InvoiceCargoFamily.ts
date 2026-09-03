import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { findCustomerEntry, resolveSavedGoodsForBooking } from "./customerBookingResolve";
import {
  detectH21CargoFamily,
  listH21CargoFamilyOptions,
  H21_CARGO_FAMILIES,
} from "../../shared/scscH21InvoiceGroups.mjs";
import type { H21CargoFamilyId } from "../../shared/scscH21InvoiceGroups.d.ts";

export type { H21CargoFamilyId };

export { detectH21CargoFamily, listH21CargoFamilyOptions, H21_CARGO_FAMILIES };

/** Lấy mô tả tên hàng lô để nhận diện nhóm (print → saved goods). */
export function resolveShipmentGoodsTextForH21(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[]
): string {
  const customer = findCustomerEntry(shipment, directory);
  const saved = resolveSavedGoodsForBooking(shipment, customer);
  return (
    shipment.goodsDescriptionPrint?.trim() ||
    saved?.goodsDescription?.trim() ||
    ""
  );
}

export function resolveH21CargoFamilyForShipment(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[]
): H21CargoFamilyId {
  return detectH21CargoFamily(resolveShipmentGoodsTextForH21(shipment, directory));
}

export function labelForH21CargoFamily(id: H21CargoFamilyId): string {
  return H21_CARGO_FAMILIES[id]?.label ?? id;
}
