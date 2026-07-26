import { describe, expect, it } from "vitest";
import {
  filterShipmentsBySessionYmd,
  filterShipmentsBySessionYmdRange,
} from "./filterShipmentsBySessionYmd";
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
  customerCode: "",
  status: "PENDING",
});

describe("filterShipmentsBySessionYmd", () => {
  it("trim sessionDate và ymd", () => {
    const rows = [minimal("a", "  2026-04-07  ", "TECS-TCS"), minimal("b", "2026-04-07", "TECS-SCSC")];
    expect(filterShipmentsBySessionYmd(rows, "2026-04-07")).toHaveLength(2);
  });
});

describe("filterShipmentsBySessionYmdRange", () => {
  it("lọc inclusive và đảo from/to nếu ngược", () => {
    const rows = [
      minimal("a", "2026-04-06", "TECS-TCS"),
      minimal("b", "2026-04-07", "TECS-TCS"),
      minimal("c", "2026-04-08", "TECS-SCSC"),
      minimal("d", "2026-04-09", "TECS-TCS"),
    ];
    expect(filterShipmentsBySessionYmdRange(rows, "2026-04-07", "2026-04-08").map((r) => r.id)).toEqual([
      "b",
      "c",
    ]);
    expect(filterShipmentsBySessionYmdRange(rows, "2026-04-08", "2026-04-07")).toHaveLength(2);
  });
});
