import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import {
  findCustomerEntry,
  resolveSavedConsigneeForBooking,
  resolveSavedGoodsForBooking,
  resolveSavedShipperForBooking,
} from "./mapBookingToScaleTicketFormData";

export type ScscPrintPickSection = "shipper" | "consignee" | "agent" | "goods";

export function scscPrintSectionsNeedingPick(
  s: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  globalAgents: GlobalAgentCatalog
): ScscPrintPickSection[] {
  const customer = findCustomerEntry(s, directory);
  const out: ScscPrintPickSection[] = [];

  const shippers = (customer?.savedShippers ?? []).filter((x) => x.id.trim());
  if (shippers.length > 1 && !s.customerShipperId?.trim() && !resolveSavedShipperForBooking(s, customer)) {
    out.push("shipper");
  }

  const consignees = (customer?.savedConsignees ?? []).filter((x) => x.id.trim());
  if (consignees.length > 1 && !s.customerConsigneeId?.trim() && !resolveSavedConsigneeForBooking(s, customer)) {
    out.push("consignee");
  }

  const agents = globalAgents.agents.filter((x) => x.id.trim());
  if (agents.length > 1) {
    out.push("agent");
  }

  const goods = (customer?.savedGoods ?? []).filter((x) => x.id.trim());
  if (goods.length > 1 && !s.customerGoodsId?.trim() && !resolveSavedGoodsForBooking(s, customer)) {
    out.push("goods");
  }

  return out;
}
