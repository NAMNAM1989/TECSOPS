/**
 * Quy trình Điền ESID:
 * 1) Xác định khách trên Ops (code/tên, VD PCS)
 * 2) Chọn Shipper / CNEE / Goods từ hồ sơ danh bạ khách
 * 3) Ghép với số liệu lô (AWB, flight, dest, pcs, kg…) để điền form TCS
 */
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  findCustomerEntry,
  resolveSavedConsigneeForBooking,
  resolveSavedGoodsForBooking,
  resolveSavedShipperForBooking,
} from "./customerBookingResolve";
import { buildShipmentPatchForSavedConsignee } from "./customerConsigneeShipmentPatch";
import {
  buildShipmentPatchForSavedGoods,
  buildShipmentPatchForSavedShipper,
} from "./customerPrintProfileLink";
import { clipScscOtherRequirementsPrint } from "./scscPrintContent";

export type EsidDeclarePartyResolveResult = {
  /** Lô đã gắn party từ hồ sơ khách (ưu tiên) + giữ số liệu Ops */
  shipment: Shipment;
  customer: CustomerDirectoryEntry | undefined;
  customerLabel: string;
  shipperFromProfile: boolean;
  consigneeFromProfile: boolean;
  goodsFromProfile: boolean;
  warnings: string[];
};

/**
 * Resolve party ESID theo khách trên lô.
 * Số liệu vận hành (AWB/flight/pcs/dest/kg) giữ nguyên từ Ops.
 */
export function resolveShipmentForEsidDeclare(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[]
): EsidDeclarePartyResolveResult {
  const warnings: string[] = [];
  const customer = findCustomerEntry(shipment, directory);
  const customerLabel =
    customer?.code?.trim() ||
    customer?.shortCode?.trim() ||
    customer?.name?.trim() ||
    shipment.customerCode?.trim() ||
    shipment.customer?.trim() ||
    "";

  if (!customer) {
    warnings.push(
      `Không khớp danh bạ khách cho «${shipment.customer || shipment.customerCode || "?"}» — dùng snapshot in trên lô`
    );
  }

  const shipper = resolveSavedShipperForBooking(shipment, customer);
  const consignee = resolveSavedConsigneeForBooking(shipment, customer);
  const goods = resolveSavedGoodsForBooking(shipment, customer);

  const partyPatch: Partial<Shipment> = {
    ...(shipper ? buildShipmentPatchForSavedShipper(shipper) : {}),
    ...(consignee ? buildShipmentPatchForSavedConsignee(consignee) : {}),
    ...(goods ? buildShipmentPatchForSavedGoods(goods) : {}),
  };

  if (customer?.otherRequirementsPrint?.trim() && !shipment.otherRequirementsPrint?.trim()) {
    partyPatch.otherRequirementsPrint = clipScscOtherRequirementsPrint(
      customer.otherRequirementsPrint
    );
  }

  const merged: Shipment = { ...shipment, ...partyPatch };

  // Fallback: nếu hồ sơ không có shipper nhưng lô đã có tên in
  if (!shipper && !(merged.shipperNamePrint || "").trim() && (shipment.customer || "").trim()) {
    merged.shipperNamePrint = shipment.customer.trim();
    warnings.push("Khách chưa có Shipper lưu sẵn — tạm dùng tên khách làm shipper");
  }
  if (!shipper && !(merged.shipperNamePrint || "").trim()) {
    warnings.push("Thiếu Shipper (hồ sơ + lô)");
  }
  if (!consignee && !(merged.consigneeNamePrint || "").trim()) {
    warnings.push("Thiếu CNEE (hồ sơ + lô)");
  }

  // Agent ESID: hồ sơ cố định (nút «Agent» thanh TCS) — không lấy / không cảnh báo theo lô.

  return {
    shipment: merged,
    customer,
    customerLabel,
    shipperFromProfile: Boolean(shipper),
    consigneeFromProfile: Boolean(consignee),
    goodsFromProfile: Boolean(goods),
    warnings,
  };
}
