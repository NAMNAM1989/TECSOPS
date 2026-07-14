import { describe, expect, it } from "vitest";
import { applyMutation } from "./stateStore.mjs";
import {
  baseContractRow,
  baseContractState,
  normalizeStateForContract,
} from "./stateMutationContractFixtures.mjs";

describe("state mutation contract (server)", () => {
  it("UPDATE patch flight/dest", () => {
    const next = applyMutation(structuredClone(baseContractState()), {
      action: "UPDATE",
      id: "c-1",
      patch: { flight: "VJ842", dest: "TPE", pcs: 50 },
    });
    expect(next.version).toBe(11);
    expect(next.rows[0]?.flight).toBe("VJ842");
    expect(next.rows[0]?.dest).toBe("TPE");
    expect(next.rows[0]?.pcs).toBe(50);
  });

  it("ADD then DELETE shipment", () => {
    const state = baseContractState();
    const addMut = {
      action: "ADD",
      shipment: {
        ...baseContractRow("placeholder"),
        awb: "978-23804012",
        flight: "VJ842",
      },
    };
    delete addMut.shipment.id;
    delete addMut.shipment.stt;
    const afterAdd = applyMutation(structuredClone(state), addMut);
    const newId = afterAdd.rows.find((r) => r.awb.includes("978"))?.id;
    expect(newId).toBeTruthy();
    const afterDel = applyMutation(afterAdd, { action: "DELETE", id: newId });
    expect(afterDel.rows).toHaveLength(1);
    expect(afterDel.rows[0]?.id).toBe("c-1");
  });

  it("SET_AIRLINE_LABEL_OVERRIDES", () => {
    const next = applyMutation(structuredClone(baseContractState()), {
      action: "SET_AIRLINE_LABEL_OVERRIDES",
      overrides: { byAwbPrefix: { "978": "VIETJET" }, byFlightPrefix: { VJ: "VJ AIR" } },
    });
    const n = normalizeStateForContract(next);
    expect(n.airlineLabelOverrides.byAwbPrefix["978"]).toBe("VIETJET");
    expect(n.airlineLabelOverrides.byFlightPrefix.VJ).toBe("VJ AIR");
  });

  it("rejects obsolete actions", () => {
    expect(() =>
      applyMutation(structuredClone(baseContractState()), {
        action: "PATCH_ECARGO_KHO_SCSC",
        shipmentId: "c-1",
      })
    ).toThrow(/Unknown action/);
  });
});
