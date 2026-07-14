import type {
  CustomerDirectoryEntry,
  CustomerSavedGoods,
  CustomerSavedShipper,
} from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { buildShipmentPatchForSavedConsignee } from "./customerConsigneeShipmentPatch";
import {
  resolveSavedConsigneeForBooking,
  resolveSavedGoodsForBooking,
  resolveSavedShipperForBooking,
} from "./customerBookingResolve";
import { normalizePrintAddressMultiline } from "./printAddressMultiline";
import { clipScscGoodsDescriptionPrint, clipScscOtherRequirementsPrint } from "./scscPrintContent";

function compactPrintText(v: string, max: number): string {
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildShipmentPatchForSavedShipper(
  sc: CustomerSavedShipper | undefined
): Partial<Shipment> {
  if (!sc) {
    return {
      customerShipperId: "",
      shipperNamePrint: "",
      shipperAddressPrint: "",
      shipperPhonePrint: "",
      shipperEmailPrint: "",
      taxCodePrint: "",
    };
  }
  return {
    customerShipperId: sc.id,
    shipperNamePrint: compactPrintText(sc.shipperName, 120),
    shipperAddressPrint: normalizePrintAddressMultiline(sc.shipperAddress, 6).slice(0, 300),
    shipperPhonePrint: compactPrintText(sc.shipperPhone, 24),
    shipperEmailPrint: compactPrintText(sc.shipperEmail, 50),
    taxCodePrint: compactPrintText(sc.taxCode, 24),
  };
}

export function buildShipmentPatchForSavedGoods(
  g: CustomerSavedGoods | undefined
): Partial<Shipment> {
  if (!g) {
    return {
      customerGoodsId: "",
      goodsDescriptionPrint: "",
    };
  }
  return {
    customerGoodsId: g.id,
    goodsDescriptionPrint: clipScscGoodsDescriptionPrint(g.goodsDescription),
  };
}

/** Gắn hồ sơ in Shipper / CNEE / Tên hàng từ danh bạ lên lô. */
export function buildShipmentPrintProfilePatch(
  customer: CustomerDirectoryEntry | undefined,
  booking?: Pick<
    Shipment,
    "customerShipperId" | "customerConsigneeId" | "customerGoodsId"
  >
): Partial<Shipment> {
  const stub = booking ?? {};
  const shipper = customer
    ? resolveSavedShipperForBooking({ ...stub } as Shipment, customer)
    : undefined;
  const consignee = customer
    ? resolveSavedConsigneeForBooking({ ...stub } as Shipment, customer)
    : undefined;
  const goods = customer ? resolveSavedGoodsForBooking({ ...stub } as Shipment, customer) : undefined;

  const otherReq =
    customer?.otherRequirementsPrint?.trim() != null
      ? clipScscOtherRequirementsPrint(customer.otherRequirementsPrint ?? "")
      : undefined;

  return {
    ...buildShipmentPatchForSavedShipper(shipper),
    ...buildShipmentPatchForSavedConsignee(consignee),
    ...buildShipmentPatchForSavedGoods(goods),
    ...(otherReq !== undefined ? { otherRequirementsPrint: otherReq } : {}),
  };
}
