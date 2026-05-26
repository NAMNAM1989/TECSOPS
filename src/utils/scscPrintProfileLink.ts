import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
} from "../types/customerDirectory";
import type { GlobalAgentCatalog, GlobalAgentEntry } from "../types/globalAgents";
import type { Shipment } from "../types/shipment";
import { buildShipmentPatchForSavedConsignee } from "./customerConsigneeShipmentPatch";
import {
  findCustomerEntry,
  resolveGlobalAgentForBooking,
  resolveSavedConsigneeForBooking,
  resolveSavedGoodsForBooking,
  resolveSavedShipperForBooking,
} from "./mapBookingToScaleTicketFormData";
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

export function buildShipmentPatchForGlobalAgent(
  agent: GlobalAgentEntry | undefined
): Partial<Shipment> {
  if (!agent || agent.isNone) {
    return {
      globalAgentId: "",
      customerAgentId: "",
      agentNamePrint: "",
      agentAddressPrint: "",
      agentPhonePrint: "",
      agentEmailPrint: "",
      agentTaxCodePrint: "",
    };
  }
  return {
    globalAgentId: agent.id,
    customerAgentId: agent.id,
    agentNamePrint: compactPrintText(agent.agentName, 45),
    agentAddressPrint: normalizePrintAddressMultiline(agent.agentAddress, 6).slice(0, 300),
    agentPhonePrint: compactPrintText(agent.agentPhone, 24),
    agentEmailPrint: compactPrintText(agent.agentEmail, 50),
    agentTaxCodePrint: compactPrintText(agent.agentTaxCode, 24),
  };
}

/** Gộp hồ sơ in Shipper / CNEE / Agent / Tên hàng từ danh bạ lên lô. */
export function buildShipmentPrintProfilePatch(
  customer: CustomerDirectoryEntry | undefined,
  globalAgents?: GlobalAgentCatalog,
  booking?: Pick<
    Shipment,
    | "customerShipperId"
    | "customerConsigneeId"
    | "customerGoodsId"
    | "globalAgentId"
    | "customerAgentId"
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
  const agent = globalAgents
    ? resolveGlobalAgentForBooking({ ...stub } as Shipment, globalAgents)
    : undefined;

  const goodsPatch = buildShipmentPatchForSavedGoods(goods);
  const otherReq =
    customer?.otherRequirementsPrint?.trim() != null
      ? clipScscOtherRequirementsPrint(customer.otherRequirementsPrint ?? "")
      : undefined;

  return {
    ...buildShipmentPatchForSavedShipper(shipper),
    ...buildShipmentPatchForSavedConsignee(consignee),
    ...goodsPatch,
    ...buildShipmentPatchForGlobalAgent(agent),
    ...(otherReq !== undefined ? { otherRequirementsPrint: otherReq } : {}),
  };
}

/** Trước khi in — đồng bộ id + snapshot in từ hồ sơ khách & agent chung. */
export function enrichShipmentPrintFromCustomerProfiles(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  globalAgents?: GlobalAgentCatalog
): Shipment {
  const customer = findCustomerEntry(shipment, directory);
  if (!customer && !globalAgents) return shipment;
  const profilePatch = buildShipmentPrintProfilePatch(customer, globalAgents, shipment);
  return { ...shipment, ...profilePatch };
}

export function resolveShipperForPrintPicker(
  shipment: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  shippers: CustomerSavedShipper[]
): CustomerSavedShipper | undefined {
  return (
    resolveSavedShipperForBooking(shipment, customer) ??
    shippers.find((s) => s.id === customer?.defaultShipperId) ??
    shippers[0]
  );
}

export function resolveConsigneeForPrintPicker(
  shipment: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  consignees: CustomerSavedConsignee[]
): CustomerSavedConsignee | undefined {
  return (
    resolveSavedConsigneeForBooking(shipment, customer) ??
    consignees.find((c) => c.id === customer?.defaultConsigneeId) ??
    consignees[0]
  );
}

export function resolveGoodsForPrintPicker(
  shipment: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  goods: CustomerSavedGoods[]
): CustomerSavedGoods | undefined {
  return (
    resolveSavedGoodsForBooking(shipment, customer) ??
    goods.find((g) => g.id === customer?.defaultGoodsId) ??
    goods[0]
  );
}

export function resolveAgentIdForPrintPicker(
  shipment: Shipment,
  globalAgents: GlobalAgentCatalog,
  agents: GlobalAgentEntry[]
): string {
  const explicit = (shipment.globalAgentId ?? shipment.customerAgentId ?? "").trim();
  if (explicit) return explicit;
  const resolved = resolveGlobalAgentForBooking(shipment, globalAgents);
  if (resolved?.id) return resolved.id;
  return (
    globalAgents.defaultAgentId?.trim() ||
    agents.find((a) => !a.isNone)?.id ||
    agents[0]?.id ||
    ""
  );
}
