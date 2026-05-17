import { describe, expect, it } from "vitest";
import type { ThermalLabelPrinterProfile } from "../printing/printTypes";
import { shipmentToTsplBody } from "./shipmentToLabelPayload";
import type { Shipment } from "../types/shipment";

function baseShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-05-17",
    warehouse: "KHO-SCSC",
    status: "PENDING",
    customer: "TEST",
    dest: "MEL",
    flight: "VJ081",
    flightDate: "18MAY",
    awb: "978-8899 9955",
    pieces: 4,
    ...overrides,
  } as Shipment;
}

const baseProfile: ThermalLabelPrinterProfile = {
  id: "thermal-100x80",
  name: "100x80",
  type: "thermal-tspl",
  connection: "tcp",
  host: "192.168.1.1",
  port: 9100,
  dpi: 203,
  labelWidthMm: 100,
  labelHeightMm: 80,
  pageWidthMm: 80,
  pageHeightMm: 100,
  gapMm: 2,
  rotation: 90,
  offsetXmm: 0,
  offsetYmm: 0,
  speed: 4,
  density: 8,
  copiesDefault: 1,
  labelSheetFormat: "100x80",
};

describe("shipmentToTsplBody", () => {
  it("gửi thermalSlots từ builtin template mặc định", () => {
    const body = shipmentToTsplBody(baseShipment(), null, baseProfile);
    const slots = body.thermalSlots as unknown[] | undefined;
    expect(Array.isArray(slots)).toBe(true);
    expect(slots!.length).toBeGreaterThan(0);
  });

  it("gửi thermalSlots khi đã lưu căn chỉnh", () => {
    const body = shipmentToTsplBody(baseShipment(), null, {
      ...baseProfile,
      thermalFieldOverrides: { pieces: { x: 50, y: 60 } },
    });
    const slots = body.thermalSlots as unknown[] | undefined;
    expect(Array.isArray(slots)).toBe(true);
    expect(slots!.length).toBeGreaterThan(0);
  });
});
