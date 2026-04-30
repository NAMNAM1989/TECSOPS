import { describe, expect, it } from "vitest";
import {
  deriveAutoWorkflowStatus,
  migrateShipmentStatus,
  workflowStatusPatchFromDataEdit,
} from "./shipmentWorkflowStatus";
import type { Shipment } from "../types/shipment";

const base = (): Shipment => ({
  id: "x",
  stt: 1,
  sessionDate: "2026-04-06",
  awb: "",
  flight: "",
  flightDate: "",
  cutoff: "",
  cutoffNote: "",
  note: "",
  dest: "",
  warehouse: "TECS-TCS",
  pcs: null,
  kg: null,
  dimWeightKg: null,
  dimLines: null,
  dimDivisor: null,
  customer: "",
  customerCode: "",
  status: "PENDING",
});

describe("deriveAutoWorkflowStatus", () => {
  it("BOOKING khi chưa đủ AWB hoặc chưa kiện", () => {
    expect(deriveAutoWorkflowStatus({ awb: "123", pcs: 5, dimWeightKg: 10, dimLines: null })).toBe("PENDING");
    expect(
      deriveAutoWorkflowStatus({ awb: "232-1825 3045", pcs: null, dimWeightKg: null, dimLines: null })
    ).toBe("PENDING");
  });

  it("ĐÃ NHẬN HÀNG khi đủ AWB + kiện, chưa DIM", () => {
    expect(
      deriveAutoWorkflowStatus({ awb: "232-1825 3045", pcs: 3, dimWeightKg: null, dimLines: null })
    ).toBe("RECEIVED");
  });

  it("ĐÃ ĐO VOLUME khi có DIM", () => {
    expect(
      deriveAutoWorkflowStatus({
        awb: "232-1825 3045",
        pcs: 3,
        dimWeightKg: 120,
        dimLines: null,
      })
    ).toBe("VOLUME_DONE");
    expect(
      deriveAutoWorkflowStatus({
        awb: "232-1825 3045",
        pcs: 3,
        dimWeightKg: null,
        dimLines: [{ lCm: 10, wCm: 10, hCm: 10, pcs: 1 }],
      })
    ).toBe("VOLUME_DONE");
  });
});

describe("workflowStatusPatchFromDataEdit", () => {
  it("không ghi đè khi đã ở trạng thái thủ công", () => {
    const prev = { ...base(), status: "CUSTOMS" as const };
    const patch = { pcs: 9 as const };
    const merged = { ...prev, ...patch };
    expect(workflowStatusPatchFromDataEdit(prev, patch, merged)).toEqual({});
  });

  it("tự lên RECEIVED khi nhập kiện từ PENDING", () => {
    const prev = { ...base(), awb: "232-1825 3045", status: "PENDING" as const };
    const patch = { pcs: 2 as const };
    const merged = { ...prev, ...patch };
    expect(workflowStatusPatchFromDataEdit(prev, patch, merged)).toEqual({ status: "RECEIVED" });
  });
});

describe("migrateShipmentStatus", () => {
  it("map legacy DEPARTED → OLA_PULL", () => {
    expect(
      migrateShipmentStatus({
        ...base(),
        status: "DEPARTED" as never,
      })
    ).toBe("OLA_PULL");
  });
});
