import { describe, expect, it } from "vitest";
import {
  compactShipmentRowForWire,
  normalizeSessionDateParam,
  parseStateScopeFromQuery,
  projectAppState,
} from "../../server/stateScope.mjs";

describe("stateScope", () => {
  it("normalizeSessionDateParam", () => {
    expect(normalizeSessionDateParam("2026-08-12")).toBe("2026-08-12");
    expect(normalizeSessionDateParam("bad")).toBe(null);
  });

  it("parseStateScopeFromQuery full / sessionDate", () => {
    expect(parseStateScopeFromQuery({ full: "1" })).toEqual({
      full: true,
      sessionDate: null,
    });
    expect(parseStateScopeFromQuery({ sessionDate: "2026-08-12" })).toEqual({
      full: false,
      sessionDate: "2026-08-12",
    });
  });

  it("projectAppState filters rows", () => {
    const state = {
      version: 3,
      rows: [
        { id: "a", sessionDate: "2026-08-12" },
        { id: "b", sessionDate: "2026-08-11" },
      ],
      customers: [{ id: "c1", code: "ABC", name: "Test" }],
    };
    const projected = projectAppState(state, {
      full: false,
      sessionDate: "2026-08-12",
    });
    expect(projected.rows).toHaveLength(1);
    expect(projected.rows[0].id).toBe("a");
    expect(projected.stateScope).toBe("2026-08-12");
    expect(projectAppState(state, { full: true }).rows).toHaveLength(2);
  });

  it("projectAppState omitCustomers", () => {
    const state = {
      version: 1,
      rows: [{ id: "a", sessionDate: "2026-08-12" }],
      customers: [{ id: "c1", code: "ABC", name: "Test" }],
    };
    const projected = projectAppState(
      state,
      {
        full: false,
        sessionDate: "2026-08-12",
      },
      { omitCustomers: true }
    );
    expect(projected.customersOmitted).toBe(true);
    expect(projected.customers).toBeUndefined();
    expect(projected.rows).toHaveLength(1);
  });

  it("compactShipmentRowForWire bỏ field rỗng, giữ khóa Ops", () => {
    const row = {
      id: "r1",
      stt: 1,
      sessionDate: "2026-09-05",
      awb: "618-1234 5678",
      hawb: "",
      flight: "SQ185",
      flightDate: "05SEP",
      cutoff: "",
      cutoffNote: "",
      note: "",
      dest: "SIN",
      warehouse: "SCSC",
      pcs: 2,
      kg: 10,
      dimWeightKg: null,
      dimLines: null,
      customer: "A",
      customerCode: "",
      shipperNamePrint: "",
      consigneeNamePrint: "CNEE CO",
      status: "RECEIVED",
    };
    const compact = compactShipmentRowForWire(row);
    expect(compact.hawb).toBeUndefined();
    expect(compact.shipperNamePrint).toBeUndefined();
    expect(compact.dimWeightKg).toBeUndefined();
    expect(compact.consigneeNamePrint).toBe("CNEE CO");
    expect(compact.cutoff).toBe("");
    expect(compact.awb).toBe("618-1234 5678");
    expect(compact.pcs).toBe(2);
  });

  it("projectAppState compact rows by default", () => {
    const state = {
      version: 2,
      rows: [
        {
          id: "a",
          stt: 1,
          sessionDate: "2026-08-12",
          awb: "1",
          flight: "VN",
          flightDate: "12AUG",
          cutoff: "",
          cutoffNote: "",
          dest: "NRT",
          warehouse: "TCS",
          customer: "X",
          status: "PENDING",
          shipperNamePrint: "",
          consigneeNamePrint: "Y",
        },
      ],
      customers: [],
    };
    const projected = projectAppState(state, {
      full: false,
      sessionDate: "2026-08-12",
    });
    expect(projected.rows[0].shipperNamePrint).toBeUndefined();
    expect(projected.rows[0].consigneeNamePrint).toBe("Y");
    expect(projected.rows[0].cutoff).toBe("");
  });
});
