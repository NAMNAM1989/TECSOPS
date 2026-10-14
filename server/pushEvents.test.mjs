import { describe, expect, it } from "vitest";
import {
  buildShipmentsChangedEvent,
  createPushEventBus,
  projectEventForSubscriber,
} from "./pushEvents.mjs";

const row = (over = {}) => ({
  id: "s-1",
  stt: 1,
  sessionDate: "2026-10-14",
  awb: "618-54405131",
  warehouse: "TECS-TCS",
  status: "PENDING",
  printNote: "in",
  ...over,
});

describe("buildShipmentsChangedEvent", () => {
  it("trả null khi không có thay đổi rows/customers", () => {
    const state = { version: 3, rows: [row()], customers: [] };
    expect(buildShipmentsChangedEvent(state, { ...state, version: 4 })).toBeNull();
  });

  it("tách upserted/removed + sessionDates + stateVersion", () => {
    const prev = {
      version: 3,
      rows: [row(), row({ id: "s-2", sessionDate: "2026-10-13", warehouse: "TECS-SCSC" })],
      customers: [],
    };
    const next = {
      version: 4,
      rows: [row({ status: "DONE" }), row({ id: "s-3", awb: "999-1" })],
      customers: [],
    };
    const event = buildShipmentsChangedEvent(prev, next, "2026-10-14T00:00:00.000Z");
    expect(event.type).toBe("shipments.changed");
    expect(event.eventId).toBe("4");
    expect(event.stateVersion).toBe(4);
    expect(event.upserted.map((s) => s.id)).toEqual(["s-1", "s-3"]);
    expect(event.upserted[0].status).toBe("DONE");
    expect(event.removed).toEqual([
      { id: "s-2", sessionDate: "2026-10-13", warehouse: "TECS-SCSC", awb: "618-54405131" },
    ]);
    expect(event.sessionDates).toEqual(["2026-10-13", "2026-10-14"]);
    expect(event.customersChanged).toBe(false);
  });

  it("báo customersChanged kèm danh sách khách", () => {
    const prev = { version: 1, rows: [], customers: [] };
    const next = { version: 2, rows: [], customers: [{ id: "c-1", code: "ACME", name: "Acme" }] };
    const event = buildShipmentsChangedEvent(prev, next);
    expect(event.customersChanged).toBe(true);
    expect(event.customers[0]).toMatchObject({ id: "c-1", code: "ACME" });
  });
});

describe("projectEventForSubscriber", () => {
  const prev = { version: 1, rows: [], customers: [] };
  const next = {
    version: 2,
    rows: [row(), row({ id: "s-9", warehouse: "TECS-SCSC" })],
    customers: [],
  };
  const event = buildShipmentsChangedEvent(prev, next);

  it("lọc theo warehouse và thu gọn view core", () => {
    const out = projectEventForSubscriber(event, { warehouse: "TECS-SCSC", view: "core" });
    expect(out.upserted.map((s) => s.id)).toEqual(["s-9"]);
    expect(out.upserted[0]).not.toHaveProperty("invoiceItems");
  });

  it("null khi event không thuộc phạm vi filter", () => {
    expect(projectEventForSubscriber(event, { sessionDate: "2020-01-01" })).toBeNull();
  });
});

describe("createPushEventBus", () => {
  const ev = (v) => ({ type: "shipments.changed", eventId: String(v), stateVersion: v, upserted: [], removed: [] });

  it("replay sự kiện sau mốc và báo gap khi vượt buffer", () => {
    const bus = createPushEventBus({ bufferSize: 2 });
    bus.setBaseline(10);
    const seen = [];
    bus.subscribe((e) => seen.push(e.stateVersion));
    bus.publish(ev(11));
    bus.publish(ev(13));
    expect(seen).toEqual([11, 13]);
    expect(bus.replaySince(10)).toEqual({ events: [ev(11), ev(13)], gap: false });
    expect(bus.replaySince(9).gap).toBe(true);

    bus.publish(ev(14));
    expect(bus.replaySince(11)).toEqual({ events: [ev(13), ev(14)], gap: false });
    expect(bus.replaySince(10).gap).toBe(true);
  });
});
