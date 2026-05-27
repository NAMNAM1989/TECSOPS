import { describe, expect, it } from "vitest";
import {
  buildStandardArrivalTimeSlots,
  buildWarehouseArrivalPlan,
  pickWarehouseTimeSlot,
  todayAtVietnamTime,
  tomorrowIsoFromVietnamDate,
} from "./ecargoWarehouseCore.mjs";

const CFG = { warehouse: { timeRule: { after20h: { timeSlot: "07:00 - 08:00" } } } };
const SLOTS = buildStandardArrivalTimeSlots();

describe("ecargoWarehouseCore", () => {
  it("buildStandardArrivalTimeSlots tạo 24 khung giờ", () => {
    expect(SLOTS[0]).toBe("00:00 - 01:00");
    expect(SLOTS[3]).toBe("03:00 - 04:00");
    expect(SLOTS).toHaveLength(24);
  });

  it("pickWarehouseTimeSlot chọn slot cách hiện tại ≥ 6 giờ (quy tắc eCargo)", () => {
    expect(pickWarehouseTimeSlot(SLOTS, { hour: 1, minute: 14 })).toBe("08:00 - 09:00");
    expect(pickWarehouseTimeSlot(SLOTS, { hour: 10, minute: 0 })).toBe("16:00 - 17:00");
  });

  it("buildWarehouseArrivalPlan ban ngày dùng hôm nay + slot tiếp theo", () => {
    const plan = buildWarehouseArrivalPlan(CFG, new Date("2026-05-28T01:14:00+07:00"));
    expect(plan.arrivalDate).toBe("2026-05-28");
    expect(plan.timeSlot).toBe("08:00 - 09:00");
  });

  it("buildWarehouseArrivalPlan sau 20h chuyển sang ngày mai 07:00–08:00", () => {
    const plan = buildWarehouseArrivalPlan(CFG, new Date("2026-05-28T20:30:00+07:00"));
    expect(plan.arrivalDate).toBe("2026-05-29");
    expect(plan.timeSlot).toBe("07:00 - 08:00");
  });

  it("tomorrowIsoFromVietnamDate", () => {
    expect(tomorrowIsoFromVietnamDate("2026-05-28")).toBe("2026-05-29");
  });

  it("todayAtVietnamTime theo timezone VN", () => {
    const vn = todayAtVietnamTime(new Date("2026-05-27T18:00:00Z"));
    expect(vn.date).toBe("2026-05-28");
    expect(vn.hour).toBe(1);
  });
});
