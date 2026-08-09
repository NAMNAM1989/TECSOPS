import { describe, expect, it } from "vitest";
import {
  aggregateEventsFromRows,
  normalizeEventAction,
  sanitizeEventMeta,
} from "./opsAiEventsStore.mjs";

describe("sanitizeEventMeta", () => {
  it("bỏ key nhạy cảm", () => {
    const out = sanitizeEventMeta({
      warehouse: "SCSC",
      otp: "123456",
      cccd: "086204007404",
      password: "x",
      driverId: "079099",
      fields: ["cneePrint", "pcs"],
    });
    expect(out.warehouse).toBe("SCSC");
    expect(out.fields).toEqual(["cneePrint", "pcs"]);
    expect(out.otp).toBeUndefined();
    expect(out.cccd).toBeUndefined();
    expect(out.password).toBeUndefined();
    expect(out.driverId).toBeUndefined();
  });

  it("cắt chuỗi dài", () => {
    const out = sanitizeEventMeta({ note: "a".repeat(200) });
    expect(out.note.length).toBe(120);
  });
});

describe("normalizeEventAction", () => {
  it("chuẩn hóa action", () => {
    expect(normalizeEventAction("Ecargo.Modal.Open")).toBe("ecargo.modal.open");
    expect(normalizeEventAction("  bad action!! ")).toBe("bad_action");
  });
});

describe("aggregateEventsFromRows", () => {
  it("đếm action và field", () => {
    const agg = aggregateEventsFromRows(
      [
        { action: "mutation.update", meta: { fields: ["pcs", "kg"] } },
        { action: "mutation.update", meta: { fields: ["pcs"] } },
        { action: "ecargo.modal.open", meta: {} },
        {
          action: "ecargo.register.fail",
          meta: { error: "VEHICLE_NO_MISSING" },
        },
      ],
      7
    );
    expect(agg.total).toBe(4);
    expect(agg.topActions[0]).toEqual({ action: "mutation.update", count: 2 });
    expect(agg.updateFields.find((f) => f.field === "pcs")?.count).toBe(2);
    expect(agg.recentErrors.some((e) => e.error === "VEHICLE_NO_MISSING")).toBe(
      true
    );
  });
});
