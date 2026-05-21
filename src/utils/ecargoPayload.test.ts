import { describe, expect, it, vi } from "vitest";
import {
  getEcargoRegisterReadiness,
  normalizeMawb,
  normalizeVehicleNo,
  parseFlightDateToIso,
} from "./ecargoPayload";
import type { Shipment } from "../types/shipment";

function sampleKhoScsc(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "1",
    stt: 1,
    sessionDate: "2026-05-10",
    awb: "978-23767936",
    flight: "VJ842",
    flightDate: "21MAY",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "TPE",
    warehouse: "KHO-SCSC",
    pcs: 10,
    kg: 100,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "X",
    customerCode: "",
    status: "RECEIVED",
    ...overrides,
  };
}

describe("normalizeMawb", () => {
  it("gộp khoảng trắng trong MAWB", () => {
    expect(normalizeMawb("978-2376 7936")).toBe("978-23767936");
  });
});

describe("parseFlightDateToIso", () => {
  it("11MAY với năm 2026 → ISO", () => {
    expect(parseFlightDateToIso("11MAY", 2026)).toBe("2026-05-11");
  });
});

describe("normalizeVehicleNo", () => {
  it("bỏ khoảng trắng và viết hoa", () => {
    expect(normalizeVehicleNo("50 h 17480")).toBe("50H17480");
  });
});

describe("getEcargoRegisterReadiness", () => {
  it("ready khi đủ số xe và các trường lô", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00+07:00"));
    const r = getEcargoRegisterReadiness(sampleKhoScsc(), "50H17480", "2026-05-20");
    expect(r.ready).toBe(true);
    expect(r.hint).toContain("Đã nhập đủ");
    vi.useRealTimers();
  });

  it("ready khi đủ số xe và các trường lô (TECS-SCSC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00+07:00"));
    const r = getEcargoRegisterReadiness(
      sampleKhoScsc({ warehouse: "TECS-SCSC" }),
      "50H17480",
      "2026-05-20"
    );
    expect(r.ready).toBe(true);
    vi.useRealTimers();
  });

  it("chưa ready khi ngày bay đã qua", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00+07:00"));
    const r = getEcargoRegisterReadiness(
      sampleKhoScsc({ flightDate: "11MAY" }),
      "50H17480",
      "2026-05-20"
    );
    expect(r.ready).toBe(false);
    expect(r.hint).toContain("Ngày bay đã qua");
    vi.useRealTimers();
  });

  it("chưa ready khi thiếu số xe", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00+07:00"));
    const r = getEcargoRegisterReadiness(sampleKhoScsc(), "", "2026-05-20");
    expect(r.ready).toBe(false);
    expect(r.hint).toContain("số xe");
    vi.useRealTimers();
  });

  it("chưa ready khi MAWB không đủ 11 số", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00+07:00"));
    const r = getEcargoRegisterReadiness(sampleKhoScsc({ awb: "123" }), "50H17480", "2026-05-20");
    expect(r.ready).toBe(false);
    expect(r.hint).toContain("MAWB");
    vi.useRealTimers();
  });
});
