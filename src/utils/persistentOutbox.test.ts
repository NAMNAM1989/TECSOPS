import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPersistentQueue,
  loadPersistentQueue,
  savePersistentQueue,
  type PersistentMutationItem,
} from "./persistentOutbox";
import type { Shipment, WarehouseCode } from "../types/shipment";

function createMockShipment(id: string): Shipment {
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
  };
}

describe("persistentOutbox", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearPersistentQueue();
  });

  it("lưu và nạp lại mutation sống qua reload", async () => {
    const items: PersistentMutationItem[] = [
      {
        id: "mut-1",
        mutation: {
          action: "ADD",
          data: createMockShipment("local-1"),
        },
        localId: "local-1",
        enqueuedAt: 1000,
      },
      {
        id: "mut-2",
        mutation: {
          action: "UPDATE",
          id: "local-1",
          patch: { flight: "VN999" },
        },
        enqueuedAt: 1005,
      },
    ];

    await savePersistentQueue(items);

    // Giả lập "reload": đọc lại từ storage
    const loaded = await loadPersistentQueue();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("mut-1");
    expect(loaded[0].mutation.action).toBe("ADD");
    expect(loaded[1].id).toBe("mut-2");
    expect(loaded[1].mutation.action).toBe("UPDATE");
  });

  it("giữ đúng thứ tự enqueuedAt khi nạp", async () => {
    const items: PersistentMutationItem[] = [
      {
        id: "later",
        mutation: { action: "UPDATE", id: "row-1", patch: { pcs: 20 } },
        enqueuedAt: 2000,
      },
      {
        id: "earlier",
        mutation: { action: "UPDATE", id: "row-1", patch: { pcs: 10 } },
        enqueuedAt: 1000,
      },
    ];

    await savePersistentQueue(items);
    const loaded = await loadPersistentQueue();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("earlier");
    expect(loaded[1].id).toBe("later");
  });

  it("xóa sạch hàng đợi khi đã gửi thành công", async () => {
    await savePersistentQueue([
      {
        id: "mut-1",
        mutation: { action: "UPDATE", id: "row-1", patch: { pcs: 5 } },
        enqueuedAt: 1000,
      },
    ]);

    await clearPersistentQueue();
    const loaded = await loadPersistentQueue();
    expect(loaded).toHaveLength(0);
  });
});
