import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { findCustomerEntry, resolveGlobalAgentForBooking } from "./mapBookingToScaleTicketFormData";
import { openScscPrintProfilePickerModal } from "./openScscPrintProfilePickerModal";
import { enrichShipmentPrintFromCustomerProfiles } from "./scscPrintProfileLink";
import { scscPrintSectionsForPicker } from "./scscPrintProfilePick";
import { shipmentForScscPrintPicker } from "./scscPrintPickerState";

export type ScscPrintConsigneeContext = {
  shipment: Shipment;
  saveToShipment: boolean;
  skipAutoSingleConsignee: boolean;
  skipAutoDefaultAgent: boolean;
  skipAutoSingleShipper: boolean;
  skipAutoSingleGoods: boolean;
};

/**
 * Trước khi in phiếu cân: chọn Shipper / CNEE / Agent / Tên hàng nếu cần.
 * @returns `null` nếu hủy.
 */
export async function ensureScscConsigneeForPrint(
  s: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  globalAgents: GlobalAgentCatalog,
  printShared?: {
    scscWeighPrintSettings?: ScscWeighPrintSettings;
    saveScscWeighPrintSettings?: (settings: ScscWeighPrintSettings) => void | Promise<void>;
  }
): Promise<ScscPrintConsigneeContext | null> {
  const enriched = enrichShipmentPrintFromCustomerProfiles(s, directory, globalAgents);
  const customer = findCustomerEntry(enriched, directory);
  const sections = scscPrintSectionsForPicker(enriched, directory, globalAgents);

  const code = enriched.customerCode?.trim() || customer?.code?.trim() || "";
  const awb = enriched.awb?.trim() || "";
  const headerSub = [code && `KH ${code}`, awb && `AWB ${awb}`].filter(Boolean).join(" · ");

  const resolvedAgent = resolveGlobalAgentForBooking(enriched, globalAgents);
  const agentLabelOnBooking =
    enriched.agentNamePrint?.trim() ||
    (resolvedAgent && !resolvedAgent.isNone ? resolvedAgent.agentName.trim() : "");

  const choice = await openScscPrintProfilePickerModal({
    headerSub: headerSub || "Chọn bộ in cho lần in này",
    shipment: enriched,
    customerDirectory: directory,
    globalAgents,
    sections,
    shippers: (customer?.savedShippers ?? []).filter((x) => x.id.trim()),
    consignees: (customer?.savedConsignees ?? []).filter((x) => x.id.trim()),
    agents: globalAgents.agents.filter((x) => x.id.trim()),
    goods: (customer?.savedGoods ?? []).filter((x) => x.id.trim()),
    bookingShipperLabel: enriched.shipperNamePrint?.trim() ?? "",
    bookingConsigneeLabel: enriched.consigneeNamePrint?.trim() ?? "",
    bookingAgentLabel: agentLabelOnBooking,
    bookingGoodsLabel: enriched.goodsDescriptionPrint?.trim() ?? "",
    scscWeighPrintSettings: printShared?.scscWeighPrintSettings,
    onSaveScscWeighPrintSettings: printShared?.saveScscWeighPrintSettings,
  });
  if (!choice) return null;

  const withProfileIds = {
    ...enriched,
    customerShipperId: choice.useBookingShipper ? enriched.customerShipperId : choice.shipperId,
    globalAgentId: choice.useBookingAgent ? enriched.globalAgentId : choice.agentId,
    customerAgentId: choice.useBookingAgent ? enriched.customerAgentId : choice.agentId,
    customerConsigneeId: choice.useBookingConsignee ? enriched.customerConsigneeId : choice.consigneeId,
    customerGoodsId: choice.useBookingGoods ? enriched.customerGoodsId : choice.goodsId,
  };
  const withSnapshots = enrichShipmentPrintFromCustomerProfiles(withProfileIds, directory, globalAgents);

  return {
    shipment: shipmentForScscPrintPicker(withSnapshots, choice),
    saveToShipment: choice.saveToShipment,
    skipAutoSingleConsignee: choice.useBookingConsignee,
    skipAutoDefaultAgent: choice.useBookingAgent,
    skipAutoSingleShipper: choice.useBookingShipper,
    skipAutoSingleGoods: choice.useBookingGoods,
  };
}
