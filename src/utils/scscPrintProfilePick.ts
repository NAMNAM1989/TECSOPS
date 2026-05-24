import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import { findCustomerEntry } from "./mapBookingToScaleTicketFormData";

export type ScscPrintPickSection = "shipper" | "consignee" | "agent" | "goods";

/** Các phần hiển thị trong modal in — mọi hồ sơ có sẵn của khách + agent chung. */
export function scscPrintSectionsForPicker(
  s: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  globalAgents: GlobalAgentCatalog
): ScscPrintPickSection[] {
  const customer = findCustomerEntry(s, directory);
  const out: ScscPrintPickSection[] = [];

  if ((customer?.savedShippers ?? []).some((x) => x.id.trim())) out.push("shipper");
  if ((customer?.savedConsignees ?? []).some((x) => x.id.trim())) out.push("consignee");

  const agents = globalAgents.agents.filter((x) => x.id.trim() && !x.isNone);
  if (agents.length > 0) out.push("agent");

  if ((customer?.savedGoods ?? []).some((x) => x.id.trim())) out.push("goods");

  return out;
}

/** @deprecated Dùng scscPrintSectionsForPicker — giữ tương thích test cũ. */
export function scscPrintSectionsNeedingPick(
  s: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  globalAgents: GlobalAgentCatalog
): ScscPrintPickSection[] {
  return scscPrintSectionsForPicker(s, directory, globalAgents);
}
