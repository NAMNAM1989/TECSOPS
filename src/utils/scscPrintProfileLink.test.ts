import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { Shipment } from "../types/shipment";
import { defaultGlobalAgentCatalog } from "./globalAgentsCore";
import {
  buildShipmentPrintProfilePatch,
  enrichShipmentPrintFromCustomerProfiles,
} from "./scscPrintProfileLink";
import { buildShipmentPatchForCustomerSelection } from "./customerShipmentPatch";

const shipperId = "ship-1";
const cneeId = "cnee-1";
const goodsId = "goods-1";

const customer: CustomerDirectoryEntry = {
  id: "cust-1",
  code: "ABC",
  name: "ABC CO",
  defaultShipperId: shipperId,
  defaultConsigneeId: cneeId,
  defaultGoodsId: goodsId,
  savedShippers: [
    {
      id: shipperId,
      label: "HCM",
      shipperName: "ABC SHIPPER",
      shipperAddress: "123 Nguyen Hue\nDist 1",
      shipperPhone: "0901234567",
      shipperEmail: "",
      taxCode: "0123",
    },
    {
      id: "ship-2",
      label: "HN",
      shipperName: "OTHER",
      shipperAddress: "",
      shipperPhone: "",
      shipperEmail: "",
      taxCode: "",
    },
  ],
  savedConsignees: [
    {
      id: cneeId,
      label: "TOKYO",
      consigneeName: "TOKYO CNEE",
      consigneeAddress: "1-2-3 Japan",
      consigneePhone: "",
      consigneeEmail: "",
      notifyName: "",
    },
  ],
  savedGoods: [{ id: goodsId, label: "G", goodsDescription: "GARMENT" }],
  savedVehicles: [],
  parties: [],
};

const globalAgents: GlobalAgentCatalog = {
  defaultAgentId: "agent-a",
  agents: [
    {
      id: "__none__",
      label: "NONE",
      agentName: "",
      agentAddress: "",
      agentPhone: "",
      agentEmail: "",
      agentTaxCode: "",
      isNone: true,
    },
    {
      id: "agent-a",
      label: "CTL",
      agentName: "CTL AGENT",
      agentAddress: "88 Market St",
      agentPhone: "0281111111",
      agentEmail: "",
      agentTaxCode: "",
    },
  ],
};

describe("scscPrintProfileLink", () => {
  it("links default shipper, cnee, goods and global agent", () => {
    const patch = buildShipmentPrintProfilePatch(customer, globalAgents);
    expect(patch.customerShipperId).toBe(shipperId);
    expect(patch.shipperNamePrint).toBe("ABC SHIPPER");
    expect(patch.customerConsigneeId).toBe(cneeId);
    expect(patch.consigneeNamePrint).toBe("TOKYO CNEE");
    expect(patch.globalAgentId).toBe("agent-a");
    expect(patch.agentNamePrint).toBe("CTL AGENT");
    expect(patch.goodsDescriptionPrint).toBe("GARMENT");
  });

  it("enriches shipment before print", () => {
    const s = { id: "s1", customer: "ABC CO", customerCode: "ABC" } as Shipment;
    const next = enrichShipmentPrintFromCustomerProfiles(s, [customer], globalAgents);
    expect(next.shipperNamePrint).toBe("ABC SHIPPER");
    expect(next.agentNamePrint).toBe("CTL AGENT");
  });
});

describe("buildShipmentPatchForCustomerSelection with profiles", () => {
  it("applies linked print profiles when picking customer", () => {
    const patch = buildShipmentPatchForCustomerSelection([customer], "ABC CO", customer, globalAgents);
    expect(patch.customerShipperId).toBe(shipperId);
    expect(patch.globalAgentId).toBe("agent-a");
    expect(patch.consigneeNamePrint).toBe("TOKYO CNEE");
  });
});
