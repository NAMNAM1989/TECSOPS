import { describe, expect, it } from "vitest";
import { assertOfflineQueueCapacity } from "./useShipmentSync";

describe("offline queue capacity", () => {
  it("cho phép dưới ngưỡng và chặn trước khi apply khi đầy", () => {
    expect(() => assertOfflineQueueCapacity(1, 2)).not.toThrow();
    expect(() => assertOfflineQueueCapacity(2, 2)).toThrow(/Hàng đợi offline đã đầy/);
  });
});
