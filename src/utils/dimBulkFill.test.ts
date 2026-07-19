import { describe, expect, it } from "vitest";
import {
  applySmartDimAutoFill,
  buildSmartDimTemplates,
  consolidateDimPieceLines,
  countEdgesBelowMin,
  DIM_TOTAL_BAND_BELOW_RATIO,
  DIM_TOTAL_CEILING_RATIO,
  DIM_RANDOM_FILL_CAP_RATIO,
  dimRandomSeed,
  enforceMaxOneEdgeBelowMin,
  generateRandomDimFill,
  normalizeDimLineEdges,
  previewSmartDimFill,
  satisfiesMaxOneEdgeBelowMin,
} from "./dimBulkFill";
import { lineDimKg, totalDimKgFromLines } from "./volumetricDim";

const TR_CTX = { flight: "TR517", awb: "618-1111 2222" } as const;

describe("normalizeDimLineEdges", () => {
  it("sắp 3 cạnh giảm dần", () => {
    expect(normalizeDimLineEdges({ lCm: 30, wCm: 50, hCm: 40, pcs: 2 })).toEqual({
      lCm: 50,
      wCm: 40,
      hCm: 30,
      pcs: 2,
    });
  });
});

describe("consolidateDimPieceLines", () => {
  it("gộp cùng size bất kể thứ tự cạnh", () => {
    const lines = consolidateDimPieceLines([
      { lCm: 40, wCm: 50, hCm: 30, pcs: 1 },
      { lCm: 50, wCm: 40, hCm: 30, pcs: 1 },
      { lCm: 40, wCm: 50, hCm: 30, pcs: 1 },
    ]);
    expect(lines).toEqual([{ lCm: 50, wCm: 40, hCm: 30, pcs: 3 }]);
  });

  it("không gộp đo thật với ước tính cùng size", () => {
    const lines = consolidateDimPieceLines([
      { lCm: 40, wCm: 50, hCm: 30, pcs: 2 },
      { lCm: 40, wCm: 50, hCm: 30, pcs: 3, estimated: true },
    ]);
    expect(lines).toHaveLength(2);
  });
});

describe("satisfiesMaxOneEdgeBelowMin", () => {
  it("cho phép 0 hoặc 1 cạnh dưới 25 cm", () => {
    expect(satisfiesMaxOneEdgeBelowMin({ lCm: 30, wCm: 25, hCm: 20 })).toBe(true);
    expect(satisfiesMaxOneEdgeBelowMin({ lCm: 25, wCm: 25, hCm: 25 })).toBe(true);
    expect(countEdgesBelowMin({ lCm: 30, wCm: 25, hCm: 20 })).toBe(1);
  });

  it("từ chối 2+ cạnh dưới 25 cm", () => {
    expect(satisfiesMaxOneEdgeBelowMin({ lCm: 20, wCm: 15, hCm: 15 })).toBe(false);
    expect(satisfiesMaxOneEdgeBelowMin({ lCm: 25, wCm: 20, hCm: 18 })).toBe(false);
  });

  it("enforce nâng cạnh để chỉ còn tối đa 1 cạnh dưới ngưỡng", () => {
    expect(enforceMaxOneEdgeBelowMin({ lCm: 25, wCm: 20, hCm: 18 })).toEqual({
      lCm: 25,
      wCm: 25,
      hCm: 18,
    });
    expect(satisfiesMaxOneEdgeBelowMin(enforceMaxOneEdgeBelowMin({ lCm: 20, wCm: 15, hCm: 15 }))).toBe(
      true
    );
  });
});

describe("buildSmartDimTemplates", () => {
  it("sinh mẫu từ kiện đo + biến thể nhỏ hơn", () => {
    const t = buildSmartDimTemplates([{ lCm: 50, wCm: 40, hCm: 30, pcs: 10 }], "smart");
    expect(t.length).toBeGreaterThan(3);
    expect(t.every((l) => l.estimated)).toBe(true);
    expect(t.every((l) => satisfiesMaxOneEdgeBelowMin(l))).toBe(true);
  });
});

describe("generateRandomDimFill — tổng DIM trong vùng ~5% dưới kg lô", () => {
  const manual = [{ lCm: 60, wCm: 50, hCm: 40, pcs: 10 }];

  it("100 kiện: 10 đo + 90 ước tính, tổng DIM dưới kg lô và trong 95–99.9%", () => {
    const declaredKg = 2000;
    const seed = dimRandomSeed("lot-1", 100, declaredKg);
    const r = generateRandomDimFill({
      manualLines: manual,
      remainingPcs: 90,
      declaredKg,
      poolId: "smart",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines.reduce((s, l) => s + l.pcs, 0)).toBe(100);
      expect(r.estimatedPcs).toBe(90);
      expect(r.totalDim).toBeLessThan(declaredKg);
      expect(r.totalDim).toBeGreaterThanOrEqual(declaredKg * (1 - DIM_TOTAL_BAND_BELOW_RATIO) - 1e-6);
      expect(r.totalDim).toBeLessThanOrEqual(declaredKg * DIM_TOTAL_CEILING_RATIO + 1e-6);
      const estimatedLines = r.lines.filter((l) => l.estimated);
      expect(estimatedLines.every((l) => satisfiesMaxOneEdgeBelowMin(l))).toBe(true);
    }
  });

  it("lô 1000 kg → tổng DIM khoảng 950–999 kg", () => {
    const declaredKg = 1000;
    const r = generateRandomDimFill({
      manualLines: [{ lCm: 40, wCm: 50, hCm: 30, pcs: 5 }],
      remainingPcs: 95,
      declaredKg,
      poolId: "smart",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-1000", 100, declaredKg),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalDim).toBeLessThan(1000);
      expect(r.totalDim).toBeGreaterThanOrEqual(950 - 1e-6);
      expect(r.totalDim).toBeLessThanOrEqual(999 + 1e-6);
    }
  });

  it("seed cố định → cùng kết quả", () => {
    const base = {
      manualLines: manual,
      remainingPcs: 90,
      declaredKg: 2000,
      poolId: "smart" as const,
      divisor: 6000 as const,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-1", 100, 2000),
    };
    const a = generateRandomDimFill(base);
    const b = generateRandomDimFill(base);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.lines).toEqual(b.lines);
  });

  it("legacy capRatio 90% tổng (tương thích cũ)", () => {
    const r = generateRandomDimFill({
      manualLines: manual,
      remainingPcs: 90,
      declaredKg: 2000,
      capRatio: DIM_RANDOM_FILL_CAP_RATIO,
      poolId: "light",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-2", 100, 2000),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalDim).toBeLessThanOrEqual(2000 * DIM_RANDOM_FILL_CAP_RATIO + 1e-6);
    }
  });
});

describe("applySmartDimAutoFill", () => {
  it("tự sinh khi còn kiện thiếu", () => {
    const preview = previewSmartDimFill(
      [{ lCm: 40, wCm: 50, hCm: 30, pcs: 10 }],
      100,
      2000
    );
    expect(preview.canAutoFill).toBe(true);
    expect(preview.remainingPcs).toBe(90);

    const r = applySmartDimAutoFill([{ lCm: 40, wCm: 50, hCm: 30, pcs: 10 }], {
      declaredPcs: 100,
      declaredKg: 2000,
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-3", 100, 2000),
    });
    expect(r.autoFilled).toBe(true);
    expect(r.lines.reduce((s, l) => s + l.pcs, 0)).toBe(100);
  });
});

describe("previewSmartDimFill", () => {
  it("không auto khi thiếu kg lô", () => {
    expect(previewSmartDimFill([{ lCm: 1, wCm: 1, hCm: 1, pcs: 1 }], 100, 0).canAutoFill).toBe(
      false
    );
  });
});
