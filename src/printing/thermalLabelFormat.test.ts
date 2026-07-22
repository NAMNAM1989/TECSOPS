import { describe, expect, it } from "vitest";
import type { ThermalLabelPrinterProfile } from "./printTypes";
import {
  resolveThermalProfileLabelFormat,
  withThermalLabelFormat,
} from "./thermalLabelFormat";

const baseThermal = (): ThermalLabelPrinterProfile =>
  withThermalLabelFormat({
    id: "t1",
    name: "Test",
    type: "thermal-tspl",
    connection: "tcp",
    host: "192.168.1.10",
    port: 9100,
    dpi: 203,
    labelWidthMm: 100,
    labelHeightMm: 80,
    pageWidthMm: 100,
    pageHeightMm: 80,
    gapMm: 2,
    rotation: 0,
    offsetXmm: 0,
    offsetYmm: 0,
    speed: 4,
    density: 8,
    copiesDefault: 1,
    labelSheetFormat: "100x80",
  });

describe("thermalLabelFormat", () => {
  it("gắn preset khi đổi khổ 100x50", () => {
    const p = withThermalLabelFormat(baseThermal(), "100x50");
    expect(p.labelSheetFormat).toBe("100x50");
    expect(p.labelHeightMm).toBe(50);
    expect(p.pageWidthMm).toBe(100);
    expect(p.pageHeightMm).toBe(50);
  });

  it("suy ra khổ từ chiều cao tem cũ", () => {
    const legacy = withThermalLabelFormat({
      ...baseThermal(),
      labelSheetFormat: undefined as unknown as "100x80",
      labelHeightMm: 50,
    });
    expect(resolveThermalProfileLabelFormat(legacy)).toBe("100x50");
  });
});
