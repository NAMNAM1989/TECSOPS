import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { findCustomerEntry, resolveGlobalAgentForBooking } from "./mapBookingToScaleTicketFormData";
import { openScscPrintProfilePickerModal } from "./openScscPrintProfilePickerModal";
import { scscPrintSectionsNeedingPick } from "./scscPrintProfilePick";

export type ScscPrintConsigneeContext = {
  shipment: Shipment;
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
  const customer = findCustomerEntry(s, directory);
  const sections = scscPrintSectionsNeedingPick(s, directory, globalAgents);
  if (sections.length === 0) {
    return {
      shipment: s,
      skipAutoSingleConsignee: false,
      skipAutoDefaultAgent: false,
      skipAutoSingleShipper: false,
      skipAutoSingleGoods: false,
    };
  }

  const code = s.customerCode?.trim() || customer?.code?.trim() || "";
  const awb = s.awb?.trim() || "";
  const headerSub = [code && `KH ${code}`, awb && `AWB ${awb}`].filter(Boolean).join(" · ");

  const resolvedAgent = resolveGlobalAgentForBooking(s, globalAgents);
  const agentLabelOnBooking =
    s.agentNamePrint?.trim() ||
    (resolvedAgent && !resolvedAgent.isNone ? resolvedAgent.agentName.trim() : "");

  const choice = await openScscPrintProfilePickerModal({
    headerSub: headerSub || "Chọn bộ in cho lần in này",
    shipment: s,
    customerDirectory: directory,
    globalAgents,
    sections,
    shippers: (customer?.savedShippers ?? []).filter((x) => x.id.trim()),
    consignees: (customer?.savedConsignees ?? []).filter((x) => x.id.trim()),
    agents: globalAgents.agents.filter((x) => x.id.trim()),
    goods: (customer?.savedGoods ?? []).filter((x) => x.id.trim()),
    bookingShipperLabel: s.shipperNamePrint?.trim() ?? "",
    bookingConsigneeLabel: s.consigneeNamePrint?.trim() ?? "",
    bookingAgentLabel: agentLabelOnBooking,
    bookingGoodsLabel: s.goodsDescriptionPrint?.trim() ?? "",
    scscWeighPrintSettings: printShared?.scscWeighPrintSettings,
    onSaveScscWeighPrintSettings: printShared?.saveScscWeighPrintSettings,
  });
  if (!choice) return null;

  return {
    shipment: {
      ...s,
      customerShipperId: choice.useBookingShipper ? s.customerShipperId : choice.shipperId,
      globalAgentId: choice.useBookingAgent ? s.globalAgentId : choice.agentId,
      customerAgentId: choice.useBookingAgent ? s.customerAgentId : choice.agentId,
      customerConsigneeId: choice.useBookingConsignee ? s.customerConsigneeId : choice.consigneeId,
      customerGoodsId: choice.useBookingGoods ? s.customerGoodsId : choice.goodsId,
    },
    skipAutoSingleConsignee: choice.useBookingConsignee,
    skipAutoDefaultAgent: choice.useBookingAgent,
    skipAutoSingleShipper: choice.useBookingShipper,
    skipAutoSingleGoods: choice.useBookingGoods,
  };
}
