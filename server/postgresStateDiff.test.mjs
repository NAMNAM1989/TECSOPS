import { describe, expect, it } from "vitest";
import {
  airlineOverridesChanged,
  customersChanged,
  planRelationalPersist,
  planShipmentDiff,
  shipmentSqlFingerprint,
} from "./postgresStateDiff.mjs";

describe("shipmentSqlFingerprint", () => {
  it("ổn định với cùng dữ liệu", () => {
    const a = { id: "1", awb: "123", stt: 1, kg: 10, invoiceItems: [{ id: "x" }] };
    const b = { id: "1", awb: "123", stt: 1, kg: 10, invoiceItems: [{ id: "x" }] };
    expect(shipmentSqlFingerprint(a)).toBe(shipmentSqlFingerprint(b));
  });

  it("đổi khi patch field persist", () => {
    const a = { id: "1", note: "a" };
    const b = { id: "1", note: "b" };
    expect(shipmentSqlFingerprint(a)).not.toBe(shipmentSqlFingerprint(b));
  });
});

describe("planShipmentDiff", () => {
  it("UPDATE một dòng → 1 upsert", () => {
    const prev = [
      { id: "a", note: "1", stt: 1 },
      { id: "b", note: "2", stt: 2 },
    ];
    const next = [
      { id: "a", note: "1x", stt: 1 },
      { id: "b", note: "2", stt: 2 },
    ];
    const plan = planShipmentDiff(prev, next);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toUpsert.map((r) => r.id)).toEqual(["a"]);
    expect(plan.unchanged).toBe(1);
  });

  it("DELETE → xóa id + upsert stt đổi", () => {
    const prev = [
      { id: "a", stt: 1 },
      { id: "b", stt: 2 },
    ];
    const next = [{ id: "b", stt: 1 }];
    const plan = planShipmentDiff(prev, next);
    expect(plan.toDelete).toEqual(["a"]);
    expect(plan.toUpsert.map((r) => r.id)).toEqual(["b"]);
  });

  it("ADD → upsert dòng mới", () => {
    const prev = [{ id: "a", stt: 1 }];
    const next = [
      { id: "a", stt: 1 },
      { id: "b", stt: 2 },
    ];
    const plan = planShipmentDiff(prev, next);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toUpsert.map((r) => r.id)).toEqual(["b"]);
    expect(plan.unchanged).toBe(1);
  });
});

describe("planRelationalPersist", () => {
  it("prev null → full", () => {
    expect(planRelationalPersist(null, { version: 1, rows: [] }).mode).toBe("full");
  });

  it("no-op same ref → skip", () => {
    const s = { version: 3, rows: [], customers: [] };
    expect(planRelationalPersist(s, s).mode).toBe("skip");
  });

  it("SET_CUSTOMERS only → diff không đụng shipment", () => {
    const prev = {
      version: 1,
      rows: [{ id: "a", note: "x" }],
      customers: [{ id: "c1", code: "AA", name: "A" }],
    };
    const next = {
      version: 2,
      rows: [{ id: "a", note: "x" }],
      customers: [{ id: "c1", code: "AA", name: "A2" }],
    };
    const plan = planRelationalPersist(prev, next);
    expect(plan.mode).toBe("diff");
    expect(plan.replaceCustomers).toBe(true);
    expect(plan.shipments.toUpsert).toHaveLength(0);
    expect(plan.shipments.unchanged).toBe(1);
  });
});

describe("customersChanged / airlineOverridesChanged", () => {
  it("detects changes", () => {
    expect(customersChanged([], [{ id: "1" }])).toBe(true);
    expect(customersChanged([{ id: "1" }], [{ id: "1" }])).toBe(false);
    expect(airlineOverridesChanged({ a: 1 }, { a: 2 })).toBe(true);
  });
});
