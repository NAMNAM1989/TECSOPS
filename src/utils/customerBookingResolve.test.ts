import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  resolveSavedConsigneeForBooking,
  resolveSavedGoodsForBooking,
  resolveSavedShipperForBooking,
} from "./customerBookingResolve";
import { buildShipmentPatchForCustomerSelection } from "./customerShipmentPatch";

function cust(partial: Partial<CustomerDirectoryEntry> & Pick<CustomerDirectoryEntry, "id" | "code" | "name">): CustomerDirectoryEntry {
  return {
    savedShippers: [],
    savedConsignees: [],
    savedGoods: [],
    savedVehicles: [],
    parties: [],
    ...partial,
  };
}

function booking(partial: Partial<Shipment>): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-08-09",
    awb: "217-12345675",
    hawb: "",
    flight: "FD301",
    flightDate: "09AUG",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "BKK",
    pcs: 1,
    kg: 10,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "A",
    customerCode: "A",
    status: "RECEIVED",
    warehouse: "TECS-TCS",
    ...partial,
  };
}

describe("resolveSaved*ForBooking stale ID", () => {
  const customerB = cust({
    id: "b",
    code: "BBB",
    name: "KHACH B",
    defaultShipperId: "ship-b",
    defaultConsigneeId: "cnee-b",
    defaultGoodsId: "goods-b",
    savedShippers: [
      {
        id: "ship-b",
        label: "",
        shipperName: "SHIPPER B",
        shipperAddress: "",
        shipperPhone: "",
        shipperEmail: "",
        taxCode: "",
      },
      {
        id: "ship-b2",
        label: "",
        shipperName: "SHIPPER B2",
        shipperAddress: "",
        shipperPhone: "",
        shipperEmail: "",
        taxCode: "",
      },
    ],
    savedConsignees: [
      {
        id: "cnee-b",
        label: "",
        consigneeName: "CNEE B",
        consigneeAddress: "",
        consigneePhone: "",
        consigneeEmail: "",
        notifyName: "",
      },
    ],
    savedGoods: [
      { id: "goods-b", label: "", goodsDescription: "CLOTHES" },
    ],
  });

  it("ID shipper của khách cũ → fallback default khách mới", () => {
    const hit = resolveSavedShipperForBooking(
      booking({ customerShipperId: "ship-from-A" }),
      customerB
    );
    expect(hit?.id).toBe("ship-b");
    expect(hit?.shipperName).toBe("SHIPPER B");
  });

  it("ID CNEE / goods lệch → fallback default", () => {
    expect(
      resolveSavedConsigneeForBooking(
        booking({ customerConsigneeId: "cnee-old" }),
        customerB
      )?.id
    ).toBe("cnee-b");
    expect(
      resolveSavedGoodsForBooking(
        booking({ customerGoodsId: "goods-old" }),
        customerB
      )?.goodsDescription
    ).toBe("CLOTHES");
  });

  it("đổi khách A→B qua patch: không giữ CNEE stale, lấy default B", () => {
    const directory = [
      cust({
        id: "a",
        code: "AAA",
        name: "KHACH A",
        savedConsignees: [
          {
            id: "cnee-a",
            label: "",
            consigneeName: "CNEE A",
            consigneeAddress: "",
            consigneePhone: "",
            consigneeEmail: "",
            notifyName: "",
          },
        ],
      }),
      customerB,
    ];
    const patch = buildShipmentPatchForCustomerSelection(
      directory,
      "KHACH B",
      customerB,
      { customerConsigneeId: "cnee-a", customerShipperId: "ship-from-A", customerGoodsId: "x" }
    );
    expect(patch.customerId).toBe("b");
    expect(patch.customerShipperId).toBe("ship-b");
    expect(patch.customerConsigneeId).toBe("cnee-b");
    expect(patch.customerGoodsId).toBe("goods-b");
    expect(patch.consigneeNamePrint).toBe("CNEE B");
  });
});
