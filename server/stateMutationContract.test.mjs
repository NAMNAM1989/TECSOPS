import { describe, expect, it } from "vitest";
import { applyMutation } from "./stateStore.mjs";
import { applyShipmentMutation } from "../src/utils/shipmentMutations.ts";
import {
  baseContractRow,
  baseContractState,
  normalizeStateForContract,
} from "./stateMutationContractFixtures.mjs";

function assertMutationParity(mutation, state = baseContractState()) {
  const serverNext = applyMutation(structuredClone(state), mutation);
  const clientNext = applyShipmentMutation(structuredClone(state), mutation);
  expect(normalizeStateForContract(clientNext)).toEqual(normalizeStateForContract(serverNext));
}

describe("state mutation contract (client vs server)", () => {
  it("UPDATE patch flight/dest", () => {
    assertMutationParity({
      action: "UPDATE",
      id: "c-1",
      patch: { flight: "VJ842", dest: "TPE", pcs: 50 },
    });
  });

  it("PATCH_ECARGO_KHO_SCSC vehicle + driver", () => {
    assertMutationParity({
      action: "PATCH_ECARGO_KHO_SCSC",
      shipmentId: "c-1",
      vehicleInput: "50H17480",
      driverName: "TEST DRIVER",
      driverId: "012345678901",
    });
  });

  it("ADD then DELETE shipment", () => {
    const state = baseContractState();
    const addMut = {
      action: "ADD",
      shipment: {
        ...baseContractRow("placeholder"),
        id: undefined,
        stt: undefined,
        awb: "978-23804012",
        flight: "VJ842",
      },
    };
    delete addMut.shipment.id;
    delete addMut.shipment.stt;
    const afterAdd = applyMutation(structuredClone(state), addMut);
    const newId = afterAdd.rows.find((r) => r.awb.includes("978"))?.id;
    expect(newId).toBeTruthy();
    assertMutationParity({ action: "DELETE", id: newId }, afterAdd);
  });

  it("SET_AIRLINE_LABEL_OVERRIDES", () => {
    assertMutationParity({
      action: "SET_AIRLINE_LABEL_OVERRIDES",
      overrides: { byAwbPrefix: { "978": "VIETJET" }, byFlightPrefix: { VJ: "VJ AIR" } },
    });
  });

  it("MERGE_ECARGO_KHO_SCSC", () => {
    assertMutationParity({
      action: "MERGE_ECARGO_KHO_SCSC",
      map: { "c-1": { vehicleInput: "51C12345", markedSubmitted: true } },
    });
  });
});
