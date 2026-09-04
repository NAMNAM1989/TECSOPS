import { describe, expect, it } from "vitest";
import {
  applyDimTemplateLines,
  resolveDefaultCustomerDimTemplate,
  scaleTemplateLinesToLotPcs,
  seedLinesFromCustomerDefault,
} from "./dimTemplateApply";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { DimPieceLine } from "./volumetricDim";

const line = (l: number, w: number, h: number, pcs: number, estimated = false): DimPieceLine => ({
  lCm: l,
  wCm: w,
  hCm: h,
  pcs,
  estimated,
});

describe("scaleTemplateLinesToLotPcs", () => {
  it("scale 1 dòng = declaredPcs", () => {
    expect(scaleTemplateLinesToLotPcs([line(40, 50, 30, 10)], 80)).toEqual([
      line(40, 50, 30, 80),
    ]);
  });

  it("giữ tỉ lệ 2 dòng và tổng đúng", () => {
    const out = scaleTemplateLinesToLotPcs(
      [line(40, 50, 30, 10), line(60, 40, 40, 30)],
      40,
    );
    expect(out.reduce((s, l) => s + l.pcs, 0)).toBe(40);
    expect(out[0]!.pcs).toBe(10);
    expect(out[1]!.pcs).toBe(30);
  });
});

describe("applyDimTemplateLines", () => {
  it("replace thay toàn bộ", () => {
    const out = applyDimTemplateLines(
      [line(1, 1, 1, 1), line(2, 2, 2, 2, true)],
      [line(40, 50, 30, 5)],
      "replace",
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.pcs).toBe(5);
  });

  it("insert chèn sau đo, giữ ước", () => {
    const out = applyDimTemplateLines(
      [line(10, 10, 10, 2), line(9, 9, 9, 3, true)],
      [line(40, 50, 30, 5)],
      "insert",
      10,
    );
    expect(out.map((l) => l.pcs)).toEqual([2, 5, 3]);
    expect(out[2]!.estimated).toBe(true);
  });

  it("scale theo kiện lô", () => {
    const out = applyDimTemplateLines(
      [],
      [line(40, 50, 30, 10)],
      "scale",
      25,
    );
    expect(out[0]!.pcs).toBe(25);
  });
});

describe("default customer dim template", () => {
  const customer = {
    code: "AGL",
    name: "A",
    defaultDimTemplateId: "t2",
    savedDimTemplates: [
      { id: "t1", label: "A", lCm: 30, wCm: 30, hCm: 30 },
      { id: "t2", label: "B", lCm: 40, wCm: 50, hCm: 30, isDefault: true },
    ],
    parties: [],
  } as CustomerDirectoryEntry;

  it("resolve theo defaultDimTemplateId", () => {
    expect(resolveDefaultCustomerDimTemplate(customer)?.id).toBe("t2");
  });

  it("seed dòng đo đủ kiện lô", () => {
    expect(seedLinesFromCustomerDefault(customer, 12)).toEqual([
      { lCm: 40, wCm: 50, hCm: 30, pcs: 12, estimated: false },
    ]);
  });

  it("multi-line template seed + scale", () => {
    const multi = {
      ...customer,
      savedDimTemplates: [
        {
          id: "m1",
          label: "Mix",
          lCm: 40,
          wCm: 50,
          hCm: 30,
          lines: [
            { lCm: 40, wCm: 50, hCm: 30, pcs: 10 },
            { lCm: 60, wCm: 40, hCm: 40, pcs: 30 },
          ],
          isDefault: true,
        },
      ],
      defaultDimTemplateId: "m1",
    } as CustomerDirectoryEntry;
    const seeded = seedLinesFromCustomerDefault(multi, 40);
    expect(seeded).toHaveLength(2);
    expect(seeded!.reduce((s, l) => s + l.pcs, 0)).toBe(40);
  });
});
