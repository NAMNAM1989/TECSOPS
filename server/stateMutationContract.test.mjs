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

  it("canonicalize AWB hoàn chỉnh ở server khi ADD/UPDATE", () => {
    const draft = baseContractRow("placeholder");
    delete draft.id;
    delete draft.stt;
    draft.awb = "00012345678";
    const afterAdd = applyMutation(structuredClone(baseContractState()), {
      action: "ADD",
      shipment: draft,
    });
    const added = afterAdd.rows.find((row) => row.awb.startsWith("000-"));
    expect(added?.awb).toBe("000-1234 5678");
    const afterUpdate = applyMutation(afterAdd, {
      action: "UPDATE",
      id: added.id,
      patch: { awb: "00187654321" },
    });
    expect(afterUpdate.rows.find((row) => row.id === added.id)?.awb).toBe("001-8765 4321");
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

  it("ADD derive status từ dữ liệu (pcs+awb → RECEIVED), không kẹt PENDING cứng", () => {
    const state = baseContractState();
    const addMut = {
      action: "ADD",
      shipment: {
        ...baseContractRow("placeholder"),
        awb: "978-23804012",
        flight: "VJ842",
        pcs: 10,
        kg: 50,
        dimWeightKg: null,
        dimLines: null,
        status: "PENDING",
      },
    };
    delete addMut.shipment.id;
    delete addMut.shipment.stt;
    const afterAdd = applyMutation(structuredClone(state), addMut);
    const added = afterAdd.rows.find((r) => String(r.awb).includes("978"));
    expect(added?.status).toBe("RECEIVED");
  });

  it("server chặn AWB hoàn chỉnh trùng nhưng cho phép nhiều booking AWB dở", () => {
    const duplicate = baseContractRow("placeholder");
    delete duplicate.id;
    delete duplicate.stt;
    expect(() =>
      applyMutation(structuredClone(baseContractState()), {
        action: "ADD",
        shipment: duplicate,
      }),
    ).toThrow(/AWB đã tồn tại/);

    const partialState = baseContractState();
    partialState.rows[0].awb = "618";
    const partial = { ...duplicate, awb: "618", sessionDate: "2026-05-29" };
    const next = applyMutation(partialState, {
      action: "ADD",
      shipment: partial,
    });
    expect(next.rows.filter((row) => row.awb === "618")).toHaveLength(2);
  });

  it("RESET_TRIAL_DATA bị chặn khi NODE_ENV=production trừ ALLOW_RESET_TRIAL_DATA=1", () => {
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_RESET_TRIAL_DATA;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_RESET_TRIAL_DATA;
      expect(() =>
        applyMutation(structuredClone(baseContractState()), { action: "RESET_TRIAL_DATA" })
      ).toThrow(/RESET_TRIAL_DATA/);

      process.env.ALLOW_RESET_TRIAL_DATA = "1";
      const wiped = applyMutation(structuredClone(baseContractState()), {
        action: "RESET_TRIAL_DATA",
      });
      expect(wiped.rows).toEqual([]);
      expect(wiped.customers).toEqual([]);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevAllow === undefined) delete process.env.ALLOW_RESET_TRIAL_DATA;
      else process.env.ALLOW_RESET_TRIAL_DATA = prevAllow;
    }
  });
});
