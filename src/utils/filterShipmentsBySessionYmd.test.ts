import { describe, expect, it } from "vitest";
import { filterShipmentsBySessionYmd } from "./filterShipmentsBySessionYmd";
import type { Shipment } from "../types/shipment";

const minimal = (id: string, sd: string, wh: Shipment["warehouse"]): Shipment => ({
  id,
  stt: 1,
  sessionDate: sd,
  awb: "000-0000 0000",
  dest: "KUL",
  flight: "",
  flightDate: "",
  cutoff: "",
  cutoffNote: "",
  note: "",
  warehouse: wh,
  pcs: 1,
  kg: 1,
  dimWeightKg: null,
  dimLines: null,
  dimDivisor: null,
  customer: "C",
  status: "PENDING",
});

describe("filterShipmentsBySessionYmd", () => {
  it("trim sessionDate và ymd", () => {
    const rows = [minimal("a", "  2026-04-07  ", "TECS-TCS"), minimal("b", "2026-04-07", "TECS-SCSC")];
    expect(filterShipmentsBySessionYmd(rows, "2026-04-07")).toHaveLength(2);
  });
});
