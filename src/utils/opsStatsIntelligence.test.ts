import { describe, expect, it } from "vitest";
import { blankShipmentDraft } from "./blankShipment";
import type { Shipment } from "../types/shipment";
import {
  airlinePrefixFromFlightKey,
  buildBookingInsights,
  collectOpsStatsAlerts,
  computeCustomerShares,
  computeFlightDestIntelligence,
  computeHhiFromShares,
  computeSameDowBaseline,
  computeStatusMix,
  computeVolumeDonePct,
  normalizeCustomerKey,
  normalizeFlightKey,
  surgeIndex,
} from "./opsStatsIntelligence";

function sample(
  partial: Partial<Shipment> & { sessionDate: string; id?: string }
): Shipment {
  const base = blankShipmentDraft(partial.sessionDate, partial.warehouse ?? "TECS-TCS");
  return {
    id: partial.id ?? `id-${partial.sessionDate}-${Math.random().toString(16).slice(2)}`,
    stt: partial.stt ?? 1,
    ...base,
    ...partial,
  };
}

describe("normalizeFlightKey", () => {
  it("bỏ zero-pad và chuẩn hóa", () => {
    expect(normalizeFlightKey("AK0521")).toBe("AK521");
    expect(normalizeFlightKey("ak 521")).toBe("AK521");
    expect(normalizeFlightKey("SQ185")).toBe("SQ185");
    expect(normalizeFlightKey("  fd-0301 ")).toBe("FD301");
    expect(normalizeFlightKey("")).toBe("");
  });

  it("airline prefix 2 ký tự", () => {
    expect(airlinePrefixFromFlightKey("AK0521")).toBe("AK");
    expect(airlinePrefixFromFlightKey("SQ185")).toBe("SQ");
  });
});

describe("normalizeCustomerKey", () => {
  it("ưu tiên code", () => {
    expect(normalizeCustomerKey("lne", "Lino")).toEqual({
      key: "code:LNE",
      label: "LNE · Lino",
    });
    expect(normalizeCustomerKey("", "ACME")).toEqual({
      key: "name:ACME",
      label: "ACME",
    });
  });
});

describe("surgeIndex / HHI", () => {
  it("surge = today / max(baseline, ε)", () => {
    expect(surgeIndex(10, 5)).toBe(2);
    expect(surgeIndex(1, 0)).toBe(2); // 1 / 0.5
  });

  it("HHI Σ share²", () => {
    expect(computeHhiFromShares([0.5, 0.5])).toBe(0.5);
    expect(computeHhiFromShares([1])).toBe(1);
  });
});

describe("status mix / volume pct", () => {
  it("mix + volume done %", () => {
    const rows = [
      sample({ sessionDate: "2026-09-18", status: "PENDING", id: "a" }),
      sample({ sessionDate: "2026-09-18", status: "VOLUME_DONE", id: "b" }),
      sample({ sessionDate: "2026-09-18", status: "WEIGH_SLIP", id: "c" }),
      sample({ sessionDate: "2026-09-18", status: "RECEIVED", id: "d" }),
    ];
    const mix = computeStatusMix(rows);
    expect(mix).toHaveLength(4);
    expect(computeVolumeDonePct(rows)).toBe(50);
  });
});

describe("collectOpsStatsAlerts", () => {
  it("bắt thiếu pcs/kg, PENDING, PER, lệch flightDate", () => {
    const rows = [
      sample({
        id: "1",
        sessionDate: "2026-09-18",
        awb: "176-1111 1111",
        pcs: null,
        kg: null,
        flight: "",
        status: "PENDING",
        cutoffNote: "PER",
        flightDate: "20SEP",
      }),
    ];
    const kinds = new Set(collectOpsStatsAlerts(rows).map((a) => a.kind));
    expect(kinds.has("missing_pcs")).toBe(true);
    expect(kinds.has("missing_kg")).toBe(true);
    expect(kinds.has("missing_flight")).toBe(true);
    expect(kinds.has("pending")).toBe(true);
    expect(kinds.has("cutoff_per")).toBe(true);
    expect(kinds.has("flight_date_skew")).toBe(true);
  });
});

describe("customer share", () => {
  it("share kg + HHI", () => {
    const rows = [
      sample({
        id: "1",
        sessionDate: "2026-09-18",
        customerCode: "A",
        customer: "Alpha",
        kg: 100,
      }),
      sample({
        id: "2",
        sessionDate: "2026-09-18",
        customerCode: "B",
        customer: "Beta",
        kg: 100,
      }),
    ];
    const { rows: share, hhiKg } = computeCustomerShares(rows);
    expect(share).toHaveLength(2);
    expect(share[0]!.shareKg).toBe(50);
    expect(hhiKg).toBe(0.5);
  });
});

describe("same DOW baseline + flight×dest", () => {
  it("baseline trung bình cùng weekday", () => {
    // 2026-09-18 = Friday; previous Fridays: 09-11, 09-04
    const history = [
      sample({ id: "f1", sessionDate: "2026-09-11", kg: 50, flight: "SQ185", dest: "SIN" }),
      sample({ id: "f2", sessionDate: "2026-09-11", kg: 50, flight: "SQ185", dest: "SIN" }),
      sample({ id: "f3", sessionDate: "2026-09-04", kg: 40, flight: "SQ185", dest: "SIN" }),
      sample({
        id: "today",
        sessionDate: "2026-09-18",
        kg: 120,
        flight: "SQ185",
        dest: "SIN",
      }),
      sample({
        id: "today2",
        sessionDate: "2026-09-18",
        kg: 80,
        flight: "SQ185",
        dest: "SIN",
      }),
      sample({
        id: "today3",
        sessionDate: "2026-09-18",
        kg: 10,
        flight: "AK0521",
        dest: "KUL",
      }),
    ];
    const base = computeSameDowBaseline(history, "2026-09-18", 8);
    expect(base.dowLabel).toBe("T6");
    expect(base.sampleDays).toBe(2);
    expect(base.baselineLots).toBe(1.5); // (2+1)/2

    const fd = computeFlightDestIntelligence(history, "2026-09-18", 8);
    const sq = fd.find((r) => r.flightKey === "SQ185" && r.dest === "SIN");
    expect(sq).toBeTruthy();
    expect(sq!.lots).toBe(2);
    expect(sq!.flightKey).toBe("SQ185");
    expect(normalizeFlightKey("AK0521")).toBe("AK521");
    const ak = fd.find((r) => r.flightKey === "AK521");
    expect(ak?.lots).toBe(1);
  });

  it("insight tiếng Việt khi đủ lịch sử", () => {
    const history = [
      sample({ id: "a", sessionDate: "2026-09-11", kg: 10, flight: "SQ185", dest: "SIN" }),
      sample({ id: "b", sessionDate: "2026-09-04", kg: 10, flight: "SQ185", dest: "SIN" }),
      sample({ id: "c", sessionDate: "2026-09-18", kg: 10, flight: "SQ185", dest: "SIN" }),
      sample({ id: "d", sessionDate: "2026-09-18", kg: 10, flight: "SQ185", dest: "SIN" }),
      sample({ id: "e", sessionDate: "2026-09-18", kg: 10, flight: "SQ185", dest: "SIN" }),
    ];
    const baseline = computeSameDowBaseline(history, "2026-09-18", 8);
    const flightDest = computeFlightDestIntelligence(history, "2026-09-18", 8);
    const lines = buildBookingInsights({
      focusYmd: "2026-09-18",
      focusTotals: { lots: 3, actualKg: 30 },
      baseline,
      flightDest,
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => /T6|SQ185|SIN/.test(l))).toBe(true);
  });
});
