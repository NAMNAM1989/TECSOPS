import { describe, expect, it } from "vitest";
import { firstWarehouseWithLots } from "./warehouseMetrics";
import type { Shipment, Warehouse } from "../types/shipment";

function row(wh: Warehouse, id: string): Shipment {
  return {
    id,
    stt: 1,
    sessionDate: "2026-07-22",
    awb: "",
    hawb: "",
    flight: "",
    flightDate: "",
    cutoff: "",
    cutoffNote: "",
    dest: "",
    warehouse: wh,
    pcs: null,
    kg: null,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "",
    customerCode: "",
    customerId: "",
    note: "",
    globalAgentId: "",
    customerShipperId: "",
    customerConsigneeId: "",
    customerGoodsId: "",
    goodsDescriptionPrint: "",
    otherRequirementsPrint: "",
    shipperNamePrint: "",
    shipperAddressPrint: "",
    shipperPhonePrint: "",
    shipperEmailPrint: "",
    taxCodePrint: "",
    agentNamePrint: "",
    agentAddressPrint: "",
    agentPhonePrint: "",
    agentEmailPrint: "",
    agentTaxCodePrint: "",
    consigneeNamePrint: "",
    consigneeAddressPrint: "",
    consigneePhonePrint: "",
    consigneeEmailPrint: "",
    notifyNamePrint: "",
    status: "PENDING",
  };
}

/**
 * Logic giữ kho khi filteredViewRows rỗng — mirror AirCargoTracking.
 * Tránh ép SCSC → TCS khi ngày chưa có lô (chặn kéo Sheet trên trang SCSC).
 */
function nextActiveWarehouse(
  prev: Warehouse,
  filteredViewRows: readonly Shipment[]
): Warehouse {
  const hasInActive = filteredViewRows.some((r) => r.warehouse === prev);
  if (hasInActive) return prev;
  if (filteredViewRows.length === 0) return prev;
  return firstWarehouseWithLots(filteredViewRows);
}

describe("active warehouse after sheet / empty day", () => {
  it("giữ TECS-SCSC khi danh sách trống", () => {
    expect(nextActiveWarehouse("TECS-SCSC", [])).toBe("TECS-SCSC");
  });

  it("giữ TECS-TCS khi danh sách trống", () => {
    expect(nextActiveWarehouse("TECS-TCS", [])).toBe("TECS-TCS");
  });

  it("chuyển sang kho còn lô khi kho hiện tại hết (do lọc)", () => {
    const onlyTcs = [row("TECS-TCS", "a")];
    expect(nextActiveWarehouse("TECS-SCSC", onlyTcs)).toBe("TECS-TCS");
  });

  it("giữ kho đang xem nếu vẫn còn lô", () => {
    const both = [row("TECS-TCS", "a"), row("TECS-SCSC", "b")];
    expect(nextActiveWarehouse("TECS-SCSC", both)).toBe("TECS-SCSC");
  });
});
