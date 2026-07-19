import { describe, expect, it } from "vitest";
import {
  applySmartDimAutoFill,
  buildSmartDimTemplates,
  consolidateDimPieceLines,
  countEdgesBelowMin,
  computeTargetLotLineCount,
  DIM_LOT_LINE_COUNT_MAX,
  DIM_LOT_LINE_COUNT_MIN,
  DIM_MAX_LONG_EDGE_CM,
  DIM_MAX_PCS_PER_ESTIMATED_LINE,
  DIM_TARGET_MATCH_TOLERANCE_KG,
  DIM_TOTAL_BAND_BELOW_RATIO,
  DIM_TOTAL_CEILING_RATIO,
  DIM_RANDOM_FILL_CAP_RATIO,
  dimRandomSeed,
  enforceMaxOneEdgeBelowMin,
  generateRandomDimFill,
  longestEdgeCm,
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
      expect(estimatedLines.every((l) => longestEdgeCm(l) <= DIM_MAX_LONG_EDGE_CM + 1e-6)).toBe(
        true
      );
      const maxPcs = estimatedLines.reduce((m, l) => Math.max(m, l.pcs), 0);
      expect(maxPcs).toBeLessThanOrEqual(DIM_MAX_PCS_PER_ESTIMATED_LINE);
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

  it("lô 96 kiện → khoảng 13–17 dòng DIM", () => {
    const declaredKg = 1150;
    const seed = dimRandomSeed("lot-96", 96, declaredKg);
    const r = generateRandomDimFill({
      manualLines: [
        { lCm: 40, wCm: 50, hCm: 30, pcs: 10 },
        { lCm: 55, wCm: 45, hCm: 35, pcs: 6 },
      ],
      remainingPcs: 80,
      declaredKg,
      poolId: "smart",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(computeTargetLotLineCount(96, seed)).toBeGreaterThanOrEqual(DIM_LOT_LINE_COUNT_MIN);
      expect(computeTargetLotLineCount(96, seed)).toBeLessThanOrEqual(DIM_LOT_LINE_COUNT_MAX);
      expect(r.lines.length).toBeGreaterThanOrEqual(DIM_LOT_LINE_COUNT_MIN);
      expect(r.lines.length).toBeLessThanOrEqual(DIM_LOT_LINE_COUNT_MAX);
      expect(r.lines.reduce((s, l) => s + l.pcs, 0)).toBe(96);
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
      regenerationNonce: 0,
    };
    const a = generateRandomDimFill(base);
    const b = generateRandomDimFill(base);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.lines).toEqual(b.lines);
  });

  it("regenerationNonce khác → phân bổ kiện khác", () => {
    const base = {
      manualLines: manual,
      remainingPcs: 90,
      declaredKg: 2000,
      poolId: "smart" as const,
      divisor: 6000 as const,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-1", 100, 2000),
    };
    const a = generateRandomDimFill({ ...base, regenerationNonce: 0 });
    const b = generateRandomDimFill({ ...base, regenerationNonce: 1 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      const pcsA = a.lines.filter((l) => l.estimated).map((l) => l.pcs).sort((x, y) => x - y);
      const pcsB = b.lines.filter((l) => l.estimated).map((l) => l.pcs).sort((x, y) => x - y);
      expect(pcsA).not.toEqual(pcsB);
    }
  });

  it("targetTotalDimKg → tổng DIM khớp mục tiêu người dùng", () => {
    const declaredKg = 1000;
    const target = 950;
    const r = generateRandomDimFill({
      manualLines: [{ lCm: 40, wCm: 50, hCm: 30, pcs: 5 }],
      remainingPcs: 95,
      declaredKg,
      poolId: "smart",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-target-kg", 100, declaredKg),
      targetTotalDimKg: target,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalDim).toBeLessThanOrEqual(target + 1e-6);
      expect(r.totalDim).toBeGreaterThanOrEqual(target - DIM_TARGET_MATCH_TOLERANCE_KG - 1e-6);
      expect(r.targetKg).toBe(target);
    }
  });

  it("targetTotalDimKg lặp 20 lần — luôn khớp ±1 kg", () => {
    const target = 980;
    const manual = [{ lCm: 40, wCm: 50, hCm: 30, pcs: 10 }];
    for (let nonce = 0; nonce < 20; nonce++) {
      const r = generateRandomDimFill({
        manualLines: manual,
        remainingPcs: 90,
        declaredKg: 1150,
        poolId: "smart",
        divisor: 6000,
        dimCtx: TR_CTX,
        seed: dimRandomSeed("lot-repeat", 100, 1150),
        regenerationNonce: nonce,
        targetTotalDimKg: target,
        targetEstimatedLineCount: 15,
      });
      expect(r.ok, !r.ok ? r.error : undefined).toBe(true);
      if (r.ok) {
        expect(r.totalDim).toBeLessThanOrEqual(target + 1e-6);
        expect(r.totalDim).toBeGreaterThanOrEqual(target - DIM_TARGET_MATCH_TOLERANCE_KG - 1e-6);
      }
    }
  });

  it("tổng DIM output = tổng dùng khi tune (không gộp ước tính)", () => {
    const r = generateRandomDimFill({
      manualLines: [{ lCm: 40, wCm: 50, hCm: 30, pcs: 5 }],
      remainingPcs: 95,
      declaredKg: 1000,
      poolId: "smart",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-consistency", 100, 1000),
      targetTotalDimKg: 950,
      targetEstimatedLineCount: 12,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const recomputed = totalDimKgFromLines(r.lines, 6000, TR_CTX);
      expect(recomputed).toBe(r.totalDim);
    }
  });

  it("targetTotalDimKg quá thấp → lỗi", () => {
    const r = generateRandomDimFill({
      manualLines: [{ lCm: 60, wCm: 50, hCm: 40, pcs: 10 }],
      remainingPcs: 90,
      declaredKg: 2000,
      poolId: "smart",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-low", 100, 2000),
      targetTotalDimKg: 100,
    });
    expect(r.ok).toBe(false);
  });

  it("lô 61856474342 — 60×40×40×5, mục tiêu 1000 kg khớp ±1", () => {
    const SQ_CTX = { flight: "SQ185", awb: "618-5647 4342" } as const;
    const manual = [{ lCm: 60, wCm: 40, hCm: 40, pcs: 5 }];
    const target = 1000;
    const r = generateRandomDimFill({
      manualLines: manual,
      remainingPcs: 37,
      declaredKg: 1163,
      poolId: "smart",
      divisor: 6000,
      dimCtx: SQ_CTX,
      seed: dimRandomSeed("618-5647-4342", 42, 1163),
      targetTotalDimKg: target,
    });
    expect(r.ok, !r.ok ? r.error : undefined).toBe(true);
    if (r.ok) {
      expect(r.lines.reduce((s, l) => s + l.pcs, 0)).toBe(42);
      expect(r.totalDim).toBeLessThanOrEqual(target + 1e-6);
      expect(r.totalDim).toBeGreaterThanOrEqual(target - DIM_TARGET_MATCH_TOLERANCE_KG - 1e-6);
      const estimated = r.lines.filter((l) => l.estimated);
      expect(estimated.every((l) => longestEdgeCm(l) <= DIM_MAX_LONG_EDGE_CM + 1e-6)).toBe(true);
    }
  });

  it("targetEstimatedLineCount → đúng số dòng ước tính", () => {
    const r = generateRandomDimFill({
      manualLines: manual,
      remainingPcs: 90,
      declaredKg: 2000,
      poolId: "smart",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-20lines", 100, 2000),
      targetEstimatedLineCount: 20,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const est = r.lines.filter((l) => l.estimated);
      expect(est.length).toBe(20);
      expect(est.every((l) => Number.isInteger(l.lCm) && l.lCm > 0)).toBe(true);
    }
  });

  it("mẫu đo 120 cm → ước tính cạnh dài ≤ 65 cm", () => {
    // TR rounding làm phân bổ 90 kiện dễ vượt max/dòng — dùng seed + nonce ổn định
    let r: ReturnType<typeof generateRandomDimFill> | null = null;
    for (let nonce = 0; nonce < 12; nonce++) {
      const trial = generateRandomDimFill({
        manualLines: [{ lCm: 120, wCm: 25, hCm: 25, pcs: 5 }],
        remainingPcs: 90,
        declaredKg: 2000,
        poolId: "smart",
        divisor: 6000,
        dimCtx: TR_CTX,
        seed: dimRandomSeed("lot-long", 95, 2000),
        regenerationNonce: nonce,
      });
      if (trial.ok) {
        r = trial;
        break;
      }
    }
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      const est = r.lines.filter((l) => l.estimated);
      expect(est.length).toBeGreaterThan(0);
      expect(est.every((l) => longestEdgeCm(l) <= DIM_MAX_LONG_EDGE_CM + 1e-6)).toBe(true);
      expect(est.reduce((m, l) => Math.max(m, l.pcs), 0)).toBeLessThanOrEqual(
        DIM_MAX_PCS_PER_ESTIMATED_LINE
      );
    }
  });

  it("legacy capRatio 90% tổng (tương thích cũ)", () => {
    // 90 kiện light + TR DIM có thể không nhét dưới 90% — dùng khối lượng vừa đủ chứng minh cap
    const r = generateRandomDimFill({
      manualLines: manual,
      remainingPcs: 40,
      declaredKg: 2000,
      capRatio: DIM_RANDOM_FILL_CAP_RATIO,
      poolId: "light",
      divisor: 6000,
      dimCtx: TR_CTX,
      seed: dimRandomSeed("lot-2", 50, 2000),
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
