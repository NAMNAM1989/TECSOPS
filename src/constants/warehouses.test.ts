import { describe, expect, it } from "vitest";
import {
  WAREHOUSE_ORDER,
  emptyWarehouseRecord,
  hasWarehouseCapability,
  isDirectOpsWarehouse,
  isScscFamily,
  isTecsHub,
  isTcsFamily,
  normalizeWarehouse,
  opsTeamOf,
  warehouseFamily,
  warehouseRole,
  warehousesOfOpsTeam,
} from "./warehouses";

describe("normalizeWarehouse", () => {
  it("exact-match 4 kho", () => {
    expect(normalizeWarehouse("TECS-TCS")).toBe("TECS-TCS");
    expect(normalizeWarehouse("TECS-SCSC")).toBe("TECS-SCSC");
    expect(normalizeWarehouse("TCS")).toBe("TCS");
    expect(normalizeWarehouse("SCSC")).toBe("SCSC");
    expect(normalizeWarehouse(" tcs ")).toBe("TCS");
    expect(normalizeWarehouse("scsc")).toBe("SCSC");
  });

  it("không gộp SCSC/TCS vào TECS-*", () => {
    expect(normalizeWarehouse("SCSC")).not.toBe("TECS-SCSC");
    expect(normalizeWarehouse("TCS")).not.toBe("TECS-TCS");
  });

  it("legacy KHO-* → hub TECS", () => {
    expect(normalizeWarehouse("KHO-SCSC")).toBe("TECS-SCSC");
    expect(normalizeWarehouse("KHO-TCS")).toBe("TECS-TCS");
  });

  it("không dùng substring — mã lạ → fallback", () => {
    expect(normalizeWarehouse("LX-SCSC")).toBe("TECS-TCS");
    expect(normalizeWarehouse("VLC-TCS")).toBe("TECS-TCS");
    expect(normalizeWarehouse("unknown", "TECS-SCSC")).toBe("TECS-SCSC");
  });
});

describe("warehouse registry", () => {
  it("thứ tự hub rồi direct", () => {
    expect(WAREHOUSE_ORDER).toEqual(["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"]);
  });

  it("family / role / capability", () => {
    expect(warehouseFamily("TECS-TCS")).toBe("TCS");
    expect(warehouseFamily("TCS")).toBe("TCS");
    expect(warehouseFamily("TECS-SCSC")).toBe("SCSC");
    expect(warehouseFamily("SCSC")).toBe("SCSC");
    expect(warehouseRole("TECS-TCS")).toBe("tecs_hub");
    expect(warehouseRole("SCSC")).toBe("direct");
    expect(isTcsFamily("TCS")).toBe(true);
    expect(isScscFamily("SCSC")).toBe(true);
    expect(hasWarehouseCapability("TCS", "dimTcsTemplate")).toBe(true);
    expect(hasWarehouseCapability("SCSC", "dimScscRules")).toBe(true);
  });

  it("emptyWarehouseRecord đủ 4 kho", () => {
    const r = emptyWarehouseRecord(() => 0);
    expect(Object.keys(r).sort()).toEqual(["SCSC", "TCS", "TECS-SCSC", "TECS-TCS"].sort());
  });

  it("3 đội OPS — TECS hub tách khỏi kho trực tiếp", () => {
    expect(opsTeamOf("TECS-TCS")).toBe("TECS");
    expect(opsTeamOf("TECS-SCSC")).toBe("TECS");
    expect(opsTeamOf("TCS")).toBe("TCS");
    expect(opsTeamOf("SCSC")).toBe("SCSC");
    expect(isTecsHub("TECS-TCS")).toBe(true);
    expect(isTecsHub("TCS")).toBe(false);
    expect(isDirectOpsWarehouse("TCS")).toBe(true);
    expect(isDirectOpsWarehouse("TECS-SCSC")).toBe(false);
    expect(warehousesOfOpsTeam("TECS")).toEqual(["TECS-TCS", "TECS-SCSC"]);
    expect(warehousesOfOpsTeam("TCS")).toEqual(["TCS"]);
    expect(warehousesOfOpsTeam("SCSC")).toEqual(["SCSC"]);
  });
});
