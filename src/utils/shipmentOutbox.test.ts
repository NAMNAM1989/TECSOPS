import { describe, expect, it } from "vitest";
import type { AppState, Shipment, WarehouseCode } from "../types";
import {
  applyPendingPatchesOverServerState,
  consolidateOutboxMutations,
  remapMutationId,
  remapOutboxItemIds,
  rollbackSingleField,
  type OutboxItem,
} from "./shipmentOutbox";

function createMockShipment(id: string, overrides?: Partial<Shipment>): Shipment {
  return {
    id,
    awb: "123-45678901",
    hawb: "H1",
    flight: "VN123",
    flightDate: "15APR",
    dest: "HAN",
    pcs: 5,
    kg: 100,
    dimWeightKg: 100,
    customer: "Khách A",
    warehouse: "HAN" as WarehouseCode,
    stt: 1,
    ...overrides,
  };
}

function createMockAppState(rows: Shipment[]): AppState {
  return {
    rows,
    customers: [],
    syncRevision: 1,
  };
}

describe("shipmentOutbox", () => {
  it("gộp patch nhiều UPDATE cùng id: field sau đè field trước, gom các field khác nhau", () => {
    const queue: OutboxItem[] = [
      {
        id: "m1",
        mutation: {
          action: "UPDATE",
          id: "row-1",
          patch: { flight: "VN123", pcs: 5 },
        },
        rowId: "row-1",
        field: "flight",
        prevValue: "VN100",
        enqueuedAt: 1000,
      },
      {
        id: "m2",
        mutation: {
          action: "UPDATE",
          id: "row-1",
          patch: { flight: "VN456", kg: 120 },
        },
        rowId: "row-1",
        field: "flight",
        prevValue: "VN123",
        enqueuedAt: 1010,
      },
      {
        id: "m3",
        mutation: {
          action: "UPDATE",
          id: "row-2",
          patch: { dest: "SGN" },
        },
        rowId: "row-2",
        field: "dest",
        prevValue: "HAN",
        enqueuedAt: 1020,
      },
    ];

    const { toSend, itemsInBatch, remainingQueue } = consolidateOutboxMutations(queue);
    expect(toSend).toHaveLength(2);
    expect(itemsInBatch).toHaveLength(3);
    expect(remainingQueue).toHaveLength(0);

    const row1Mut = toSend.find((m) => m.action === "UPDATE" && m.id === "row-1");
    expect(row1Mut).toBeDefined();
    if (row1Mut && row1Mut.action === "UPDATE") {
      expect(row1Mut.patch).toEqual({
        flight: "VN456", // m2 đè m1
        pcs: 5,          // từ m1
        kg: 120,         // từ m2
      });
    }

    const row2Mut = toSend.find((m) => m.action === "UPDATE" && m.id === "row-2");
    expect(row2Mut).toBeDefined();
  });

  it("tách riêng ADD trước rồi mới đến UPDATE, và hỗ trợ remap localId", () => {
    const queue: OutboxItem[] = [
      {
        id: "m1",
        mutation: {
          action: "ADD",
          data: createMockShipment("local-123", { awb: "000-11112222" }),
        },
        rowId: "local-123",
        field: "awb",
        prevValue: null,
        enqueuedAt: 1000,
      },
      {
        id: "m2",
        mutation: {
          action: "UPDATE",
          id: "local-123",
          patch: { flight: "VJ999" },
        },
        rowId: "local-123",
        field: "flight",
        prevValue: "VJ111",
        enqueuedAt: 1005,
      },
    ];

    const firstRun = consolidateOutboxMutations(queue);
    expect(firstRun.isAddBatch).toBe(true);
    expect(firstRun.toSend).toHaveLength(1);
    expect(firstRun.toSend[0].action).toBe("ADD");
    expect(firstRun.remainingQueue).toHaveLength(1);

    // Remap ID sau khi server trả về real ID
    const idMap = new Map<string, string>([["local-123", "server-real-999"]]);
    const remaining = remapOutboxItemIds(firstRun.remainingQueue, idMap);
    expect(remaining[0].rowId).toBe("server-real-999");
    if (remaining[0].mutation.action === "UPDATE") {
      expect(remaining[0].mutation.id).toBe("server-real-999");
    }

    const remappedSingle = remapMutationId(queue[1].mutation, idMap);
    if (remappedSingle.action === "UPDATE") {
      expect(remappedSingle.id).toBe("server-real-999");
    }
  });

  it("rollback đúng 1 field khi server báo lỗi", () => {
    const state = createMockAppState([
      createMockShipment("row-1", {
        pcs: 10,
        kg: 50,
        dest: "HAN",
      }),
    ]);

    // Rollback chỉ field "pcs" về giá trị cũ là 5
    const rolledBack = rollbackSingleField(state, "row-1", "pcs", 5);
    const row = rolledBack.rows.find((r) => r.id === "row-1")!;
    expect(row.pcs).toBe(5); // rolled back
    expect(row.kg).toBe(50); // unchanged
    expect(row.dest).toBe("HAN"); // unchanged
  });

  it("socket sync đến: server thắng trừ các ô đang pending trong outbox", () => {
    const serverState = createMockAppState([
      createMockShipment("row-1", { flight: "SERVER_FLIGHT", pcs: 99, kg: 888 }),
      createMockShipment("row-2", { flight: "SERVER_FLIGHT_2", pcs: 10 }),
    ]);

    const queue: OutboxItem[] = [
      {
        id: "m1",
        mutation: {
          action: "UPDATE",
          id: "row-1",
          patch: { pcs: 100 }, // pending edit
        },
        rowId: "row-1",
        field: "pcs",
        prevValue: 99,
        enqueuedAt: 1000,
      },
    ];

    const merged = applyPendingPatchesOverServerState(serverState, queue);
    const row1 = merged.rows.find((r) => r.id === "row-1")!;
    const row2 = merged.rows.find((r) => r.id === "row-2")!;

    // server thắng ở flight và kg
    expect(row1.flight).toBe("SERVER_FLIGHT");
    expect(row1.kg).toBe(888);
    // nhưng pcs đang pending nên giữ 100
    expect(row1.pcs).toBe(100);

    // row-2 hoàn toàn theo server
    expect(row2.flight).toBe("SERVER_FLIGHT_2");
    expect(row2.pcs).toBe(10);
  });
});
