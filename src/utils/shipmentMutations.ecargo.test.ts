import { describe, it, expect } from "vitest";
import { applyShipmentMutation, type AppState } from "./shipmentMutations";

function baseState(): AppState {
  return {
    version: 3,
    rows: [
      {
        id: "s1",
        stt: 1,
        sessionDate: "2026-05-10",
        awb: "978-25562555",
        hawb: "",
        flight: "VJ85",
        flightDate: "10MAY",
        cutoff: "",
        cutoffNote: "",
        note: "",
        dest: "SYD",
        warehouse: "KHO-SCSC",
        pcs: 1,
        kg: 1,
        dimWeightKg: null,
        dimLines: null,
        dimDivisor: null,
        customer: "cyl",
        customerCode: "",
        status: "RECEIVED",
      },
    ],
    customers: [],
    ecargoKhoScsc: {},
  };
}

describe("PATCH_ECARGO_KHO_SCSC", () => {
  it("lưu số xe và tăng version", () => {
    const next = applyShipmentMutation(baseState(), {
      action: "PATCH_ECARGO_KHO_SCSC",
      shipmentId: "s1",
      vehicleInput: "50H17480",
    });
    expect(next.version).toBe(4);
    expect(next.ecargoKhoScsc?.s1?.vehicleInput).toBe("50H17480");
  });

  it("xóa ecargo khi DELETE shipment", () => {
    const withEcargo = applyShipmentMutation(baseState(), {
      action: "PATCH_ECARGO_KHO_SCSC",
      shipmentId: "s1",
      vehicleInput: "50H17480",
    });
    const next = applyShipmentMutation(withEcargo, { action: "DELETE", id: "s1" });
    expect(next.rows).toHaveLength(0);
    expect(next.ecargoKhoScsc?.s1).toBeUndefined();
  });
});

describe("DELETE + ADD cùng AWB", () => {
  it("cho phép nhập lại AWB sau khi xóa hẳn lô", () => {
    const deleted = applyShipmentMutation(baseState(), { action: "DELETE", id: "s1" });
    expect(deleted.rows).toHaveLength(0);

    const readded = applyShipmentMutation(deleted, {
      action: "ADD",
      shipment: {
        sessionDate: "2026-05-10",
        awb: "978-25562555",
        hawb: "",
        flight: "VJ85",
        flightDate: "10MAY",
        cutoff: "",
        cutoffNote: "",
        note: "",
        dest: "SYD",
        warehouse: "KHO-SCSC",
        pcs: 2,
        kg: 2,
        dimWeightKg: null,
        dimLines: null,
        dimDivisor: null,
        customer: "cyl",
        customerCode: "",
        status: "PENDING",
      },
    });
    expect(readded.rows).toHaveLength(1);
    expect(readded.rows[0].awb).toBe("978-25562555");
  });
});
