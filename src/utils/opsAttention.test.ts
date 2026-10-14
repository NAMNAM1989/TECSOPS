import { describe, expect, it } from "vitest";
import {
  computeShipmentAttention,
  groupFlightKey,
  isAttentionRow,
  countAttentionRows,
} from "./opsAttention";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "./blankShipment";

function makeRow(partial: Partial<Shipment>): Shipment {
  return {
    ...blankShipmentDraft("TECS-TCS"),
    id: "test-1",
    awb: "978-2408 8584",
    pcs: 10,
    kg: 100,
    flight: "VJ1813",
    flightDate: "26SEP",
    dest: "ICN",
    ...partial,
  };
}

describe("groupFlightKey", () => {
  it("normalizes leading zeros for standard flight numbers", () => {
    expect(groupFlightKey("VJ081")).toBe("VJ81");
    expect(groupFlightKey("VJ81")).toBe("VJ81");
    expect(groupFlightKey("VN0023")).toBe("VN23");
    expect(groupFlightKey("VN23A")).toBe("VN23A");
  });

  it("handles non-matching flight codes gracefully", () => {
    expect(groupFlightKey("CHARTER")).toBe("CHARTER");
    expect(groupFlightKey("")).toBe("");
  });
});

describe("computeShipmentAttention", () => {
  it("flags incomplete AWB (high severity)", () => {
    const row = makeRow({ awb: "978-2408" });
    const att = computeShipmentAttention(row, [row]);
    expect(att.needsAttention).toBe(true);
    expect(att.highestSeverity).toBe("high");
    expect(att.flags.some((f) => f.id === "awb_incomplete")).toBe(true);
  });

  it("flags duplicate AWB (high severity)", () => {
    const row1 = makeRow({ id: "row-1", stt: 1, awb: "978-2408 8584" });
    const row2 = makeRow({ id: "row-2", stt: 2, awb: "978-2408 8584" });
    const att = computeShipmentAttention(row1, [row1, row2]);
    expect(att.needsAttention).toBe(true);
    expect(att.flags.some((f) => f.id === "awb_duplicate")).toBe(true);
  });

  it("flags 0 pcs (high severity)", () => {
    const row = makeRow({ pcs: 0 });
    const att = computeShipmentAttention(row, [row]);
    expect(att.needsAttention).toBe(true);
    expect(att.flags.some((f) => f.id === "pcs_zero")).toBe(true);
  });

  it("flags missing pcs (high severity)", () => {
    const row = makeRow({ pcs: undefined });
    const att = computeShipmentAttention(row, [row]);
    expect(att.needsAttention).toBe(true);
    expect(att.flags.some((f) => f.id === "pcs_missing")).toBe(true);
  });

  it("flags missing flight or flightDate (medium severity)", () => {
    const row = makeRow({ flight: "" });
    const att = computeShipmentAttention(row, [row]);
    expect(att.needsAttention).toBe(true);
    expect(att.highestSeverity).toBe("medium");
    expect(att.flags.some((f) => f.id === "flight_missing")).toBe(true);
  });

  it("flags missing or short dest (medium severity)", () => {
    const row = makeRow({ dest: "IC" });
    const att = computeShipmentAttention(row, [row]);
    expect(att.needsAttention).toBe(true);
    expect(att.highestSeverity).toBe("medium");
    expect(att.flags.some((f) => f.id === "dest_missing")).toBe(true);
  });

  it("flags fly_today as info severity", () => {
    const row = makeRow({ flightDate: "26SEP" });
    const att = computeShipmentAttention(row, [row], "2026-09-26");
    expect(att.flags.some((f) => f.id === "fly_today")).toBe(true);
    expect(att.needsAttention).toBe(false); // only info, not high/medium
  });

  it("flags different flight number formatting across shipments as info", () => {
    const row1 = makeRow({ id: "row-1", awb: "978-2408 8584", flight: "VJ81" });
    const row2 = makeRow({ id: "row-2", awb: "978-2408 8595", flight: "VJ081" });
    const att = computeShipmentAttention(row1, [row1, row2]);
    expect(att.flags.some((f) => f.id === "flight_format")).toBe(true);
    expect(att.needsAttention).toBe(false);
  });

  it("evaluates a valid complete row as not needing attention", () => {
    const row = makeRow({});
    const att = computeShipmentAttention(row, [row]);
    expect(att.needsAttention).toBe(false);
    expect(att.flags).toHaveLength(0);
  });
});

describe("isAttentionRow and countAttentionRows", () => {
  it("counts rows correctly", () => {
    const rowOk = makeRow({ id: "1", awb: "978-2408 8584" });
    const rowBad = makeRow({ id: "2", awb: "978-2408 8595", pcs: 0 });
    const rows = [rowOk, rowBad];
    expect(isAttentionRow(rowOk, rows)).toBe(false);
    expect(isAttentionRow(rowBad, rows)).toBe(true);
    expect(countAttentionRows(rows, rows)).toBe(1);
  });
});
