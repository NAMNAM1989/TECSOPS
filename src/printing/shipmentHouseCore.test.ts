import { describe, expect, it } from "vitest";
import {
  canSubmitHousePrintPlan,
  emptyShipmentHouse,
  migrateLegacyHawbToHouses,
  normalizeShipmentHouse,
  sumAllocatedHousePcs,
  validateShipmentHouses,
} from "./shipmentHouseCore";

describe("shipmentHouseCore", () => {
  it("normalize bỏ hawb trống và pcs không hợp lệ", () => {
    expect(normalizeShipmentHouse({ hawb: "  " }, "s1")).toBeNull();
    expect(normalizeShipmentHouse({ hawb: "H1", pcs: 0 }, "s1")).toBeNull();
    expect(normalizeShipmentHouse({ hawb: "H1", pcs: 1.5 }, "s1")).toBeNull();
    const ok = normalizeShipmentHouse({ hawb: " h1 ", pcs: 3, dest: "bkk" }, "s1");
    expect(ok?.hawb).toBe("h1");
    expect(ok?.pcs).toBe(3);
    expect(ok?.dest).toBe("BKK");
    expect(ok?.allocationStatus).toBe("needs-confirmation");
  });

  it("migrate legacy hawb → một house needs-confirmation, không gán pcs", () => {
    const houses = migrateLegacyHawbToHouses("ship-1", "  HAWB-9 ");
    expect(houses).toHaveLength(1);
    expect(houses[0].hawb).toBe("HAWB-9");
    expect(houses[0].pcs).toBeNull();
    expect(houses[0].allocationStatus).toBe("needs-confirmation");
    expect(migrateLegacyHawbToHouses("ship-1", "")).toEqual([]);
    const existing = [emptyShipmentHouse("ship-1", { hawb: "A", sortOrder: 0 })];
    expect(migrateLegacyHawbToHouses("ship-1", "B", existing)).toEqual(existing);
  });

  it("reject HAWB trùng và tổng pcs vượt master", () => {
    const houses = [
      emptyShipmentHouse("s", { id: "1", hawb: "A", pcs: 4, sortOrder: 0 }),
      emptyShipmentHouse("s", { id: "2", hawb: "a", pcs: 3, sortOrder: 1 }),
    ];
    const dup = validateShipmentHouses(houses, 10);
    expect(dup.errors.some((e) => /trùng/i.test(e))).toBe(true);

    const okHouses = [
      emptyShipmentHouse("s", { id: "1", hawb: "A", pcs: 4, sortOrder: 0 }),
      emptyShipmentHouse("s", { id: "2", hawb: "B", pcs: 5, sortOrder: 1 }),
    ];
    const over = validateShipmentHouses(okHouses, 8);
    expect(over.errors.some((e) => /vượt master/i.test(e))).toBe(true);
    expect(sumAllocatedHousePcs(okHouses)).toBe(9);

    const fit = validateShipmentHouses(okHouses, 10);
    expect(fit.errors).toEqual([]);
    expect(fit.unassignedPcs).toBe(1);
    expect(fit.warnings.some((w) => /chưa phân bổ/i.test(w))).toBe(true);
    expect(canSubmitHousePrintPlan(fit)).toBe(true);
  });

  it("pcs null không tính vào allocated; vẫn cảnh báo needs-confirmation", () => {
    const houses = [
      emptyShipmentHouse("s", {
        hawb: "LEGACY",
        pcs: null,
        allocationStatus: "needs-confirmation",
      }),
    ];
    const summary = validateShipmentHouses(houses, 5);
    expect(summary.allocatedPcs).toBe(0);
    expect(summary.unassignedPcs).toBe(5);
    expect(summary.warnings.some((w) => /xác nhận/i.test(w))).toBe(true);
    expect(canSubmitHousePrintPlan(summary)).toBe(true);
  });
});
