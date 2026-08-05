import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "./blankShipment";
import { buildCargoDayReport, filterCargoDayReportByWarehouses } from "./cargoDayReport";
import {
  cargoDayReportImageColWidths,
  resolveCargoDayReportCopyKind,
  type CargoDayReportCopyKind,
} from "./cargoDayReportImage";

function lot(
  partial: Partial<Shipment> & Pick<Shipment, "id" | "warehouse">,
): Shipment {
  return {
    ...blankShipmentDraft("2026-07-27", partial.warehouse),
    stt: 1,
    ...partial,
  };
}

function scopedWarehouses(kind: CargoDayReportCopyKind) {
  const model = buildCargoDayReport(
    [
      lot({ id: "tt", warehouse: "TECS-TCS", awb: "17611111111", dest: "SGN" }),
      lot({ id: "ts", warehouse: "TECS-SCSC", awb: "16099999999", dest: "ICN" }),
      lot({ id: "t", warehouse: "TCS", awb: "16088888888", dest: "HAN" }),
      lot({ id: "s", warehouse: "SCSC", awb: "16077777777", dest: "BKK" }),
    ],
    "2026-07-27",
  );
  const resolved = resolveCargoDayReportCopyKind(kind);
  return filterCargoDayReportByWarehouses(model, resolved.warehouses);
}

describe("cargoDayReportImage layout", () => {
  it("Tecs: AWB đủ rộng, Customer/Flight rõ, Cutoff hẹp", () => {
    const w = cargoDayReportImageColWidths("withCustomer");
    expect(w.booking).toBeGreaterThanOrEqual(190);
    expect(w.customer).toBeGreaterThanOrEqual(170);
    expect(w.flightDate).toBeGreaterThanOrEqual(250);
    expect(w.cutoff).toBeLessThanOrEqual(120);
    expect(w.flightDate).toBeGreaterThanOrEqual(
      cargoDayReportImageColWidths("basic").flightDate!,
    );
  });

  it("Vantage: AWB + Flight rộng, Cutoff thu hẹp", () => {
    const w = cargoDayReportImageColWidths("basic");
    expect(w.booking).toBeGreaterThanOrEqual(190);
    expect(w.flightDate).toBeGreaterThanOrEqual(200);
    expect(w.cutoff).toBeLessThanOrEqual(160);
    expect(w.customer).toBeUndefined();
  });

  it("resolve copy kind — kho TECS = 2 mã; TCS/SCSC = kho riêng", () => {
    expect(resolveCargoDayReportCopyKind("vantage", "TCS")).toMatchObject({
      variant: "basic",
      warehouses: ["TECS-TCS", "TECS-SCSC"],
      label: "Vantage",
    });
    expect(resolveCargoDayReportCopyKind("tecs", "SCSC")).toMatchObject({
      variant: "withCustomer",
      warehouses: ["TECS-TCS", "TECS-SCSC"],
      label: "Tecs",
    });
    expect(resolveCargoDayReportCopyKind("tcs", "TECS-TCS")).toMatchObject({
      warehouses: ["TCS"],
      label: "TCS",
    });
    expect(resolveCargoDayReportCopyKind("scsc", "TECS-SCSC")).toMatchObject({
      warehouses: ["SCSC"],
      label: "SCSC",
    });
  });

  it("Tecs/Vantage: chỉ mã trong kho TECS — không lấy kho TCS/SCSC", () => {
    for (const kind of ["tecs", "vantage"] as const) {
      const scoped = scopedWarehouses(kind);
      expect(scoped.totalLots).toBe(2);
      expect(scoped.sections.map((s) => s.warehouse)).toEqual([
        "TECS-TCS",
        "TECS-SCSC",
      ]);
      expect(scoped.sections.some((s) => s.warehouse === "TCS")).toBe(false);
      expect(scoped.sections.some((s) => s.warehouse === "SCSC")).toBe(false);
    }
    expect(resolveCargoDayReportCopyKind("vantage").variant).toBe("basic");
    expect(resolveCargoDayReportCopyKind("tecs").variant).toBe("withCustomer");
  });

  it("TCS: chỉ mã TCS — không lấy TECS-TCS", () => {
    const scoped = scopedWarehouses("tcs");
    expect(scoped.totalLots).toBe(1);
    expect(scoped.sections.map((s) => s.warehouse)).toEqual(["TCS"]);
    expect(scoped.sections.some((s) => s.warehouse === "TECS-TCS")).toBe(false);
  });

  it("SCSC: chỉ mã SCSC — không lấy TECS-SCSC", () => {
    const scoped = scopedWarehouses("scsc");
    expect(scoped.totalLots).toBe(1);
    expect(scoped.sections.map((s) => s.warehouse)).toEqual(["SCSC"]);
    expect(scoped.sections.some((s) => s.warehouse === "TECS-SCSC")).toBe(false);
  });
});
