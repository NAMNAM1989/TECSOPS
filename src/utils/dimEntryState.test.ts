import { describe, expect, it } from "vitest";
import {
  dimEntryAddMeasuredFromCombo,
  dimEntryMergeLines,
  dimEntryRandomFill,
  dimEntrySeed,
  dimEntryValidateSave,
  snapshotDimEntry,
} from "./dimEntryState";
import { dimRandomSeed } from "./dimBulkFill";

const TR_CTX = { flight: "TR517", awb: "618-1111 2222" } as const;
const LOT = { shipmentId: "s1", declaredPcs: 96, declaredKg: 1150 };

describe("snapshotDimEntry", () => {
  it("bước 2 khi còn kiện thiếu sau đo mẫu", () => {
    const snap = snapshotDimEntry(
      [{ lCm: 50, wCm: 40, hCm: 30, pcs: 16 }],
      LOT,
      6000,
      TR_CTX
    );
    expect(snap.workflowStep).toBe(2);
    expect(snap.remainingPcs).toBe(80);
    expect(snap.sumMeasuredPcs).toBe(16);
  });
});

describe("dimEntryAddMeasuredFromCombo", () => {
  it("xóa ước tính cũ khi thêm mẫu đo mới", () => {
    const prev = [
      { lCm: 50, wCm: 40, hCm: 30, pcs: 10 },
      { lCm: 40, wCm: 35, hCm: 28, pcs: 5, estimated: true as const },
    ];
    const r = dimEntryAddMeasuredFromCombo(prev, "55×45×35×2", LOT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines.every((l) => !l.estimated)).toBe(true);
      expect(r.lines.reduce((s, l) => s + l.pcs, 0)).toBe(12);
      expect(r.note).toContain("ước tính");
    }
  });
});

describe("dimEntryRandomFill", () => {
  it("sinh kiện ước tính còn lại", () => {
    const lot96 = { shipmentId: "lot-96", declaredPcs: 96, declaredKg: 1150 };
    const seed = dimRandomSeed("lot-96", 96, 1150);
    const r = dimEntryRandomFill(
      [
        { lCm: 40, wCm: 50, hCm: 30, pcs: 10 },
        { lCm: 55, wCm: 45, hCm: 35, pcs: 6 },
      ],
      lot96,
      { declaredPcs: 96, declaredKg: 1150, divisor: 6000, dimCtx: TR_CTX, seed }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines.reduce((s, l) => s + l.pcs, 0)).toBe(96);
      const snap = snapshotDimEntry(r.lines, lot96, 6000, TR_CTX);
      expect(snap.remainingPcs).toBe(0);
      expect(snap.pcsMatch).toBe(true);
      expect(snap.canRandomFill).toBe(false);
      expect(snap.workflowStep).toBe(3);
    }
  });
});

describe("dimEntryValidateSave", () => {
  it("chặn lưu khi dư kiện", () => {
    const r = dimEntryValidateSave(
      [{ lCm: 50, wCm: 40, hCm: 30, pcs: 100 }],
      LOT,
      6000,
      TR_CTX
    );
    expect(r.ok).toBe(false);
  });

  it("cho lưu khi DIM volumetric lớn hơn cân lô", () => {
    const lines = [{ lCm: 120, wCm: 80, hCm: 70, pcs: 96 }];
    const r = dimEntryValidateSave(lines, LOT, 6000, TR_CTX);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const snap = snapshotDimEntry(r.lines, LOT, 6000, TR_CTX);
      expect(snap.dimBelowGross).toBe(false);
      expect((snap.totalDim ?? 0) > (LOT.declaredKg ?? 0)).toBe(true);
    }
  });
});

describe("dimEntryMergeLines", () => {
  it("gộp cùng size", () => {
    const r = dimEntryMergeLines([
      { lCm: 50, wCm: 40, hCm: 30, pcs: 2 },
      { lCm: 40, wCm: 50, hCm: 30, pcs: 3 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toHaveLength(1);
  });
});

describe("dimEntrySeed", () => {
  it("ổn định theo lô", () => {
    expect(dimEntrySeed(LOT)).toBe(dimRandomSeed("s1", 96, 1150));
  });
});

describe("kiểm tra khóa dòng kiện", () => {
  it("giữ nguyên dòng ước tính đã khóa khi sinh ngẫu nhiên lại hoặc thêm đo thật mới", () => {
    const prev = [
      { lCm: 50, wCm: 40, hCm: 30, pcs: 10 },
      { lCm: 40, wCm: 30, hCm: 20, pcs: 5, estimated: true, locked: true }, // dòng ước tính bị khóa
      { lCm: 30, wCm: 30, hCm: 30, pcs: 8, estimated: true }, // dòng ước tính không khóa
    ];

    // Thêm đo thật mới qua combo, dòng ước tính không khóa bị xóa, dòng ước tính đã khóa phải được giữ nguyên
    const rAdd = dimEntryAddMeasuredFromCombo(prev, "60×40×40×2", LOT);
    expect(rAdd.ok).toBe(true);
    if (rAdd.ok) {
      // Dòng 1: 50x40x30 x 10 (đo thật cũ)
      // Dòng 2: 40x30x20 x 5 (ước tính đã khóa) -> được giữ lại!
      // Dòng 3: 60x40x40 x 2 (đo thật mới thêm)
      // Dòng ước tính không khóa 30x30x30 x 8 bị xóa.
      expect(rAdd.lines).toHaveLength(3);
      expect(rAdd.lines.some(l => l.lCm === 40 && l.wCm === 30 && l.pcs === 5 && l.locked)).toBe(true);
      expect(rAdd.lines.some(l => l.lCm === 30 && l.wCm === 30)).toBe(false);
    }

    // Sinh ngẫu nhiên lại: dòng ước tính đã khóa được giữ nguyên
    const seed = dimRandomSeed("lot-lock", 96, 1150);
    const rFill = dimEntryRandomFill(
      [
        { lCm: 50, wCm: 40, hCm: 30, pcs: 10 },
        { lCm: 40, wCm: 30, hCm: 20, pcs: 5, estimated: true, locked: true },
      ],
      { shipmentId: "lot-lock", declaredPcs: 96, declaredKg: 1150 },
      { declaredPcs: 96, declaredKg: 1150, divisor: 6000, dimCtx: TR_CTX, seed }
    );
    expect(rFill.ok).toBe(true);
    if (rFill.ok) {
      expect(rFill.lines.reduce((s, l) => s + l.pcs, 0)).toBe(96);
      // Dòng khóa 40x30x20 x 5 vẫn phải còn nguyên vẹn trong danh sách sinh ra
      const lockedLine = rFill.lines.find(l => l.lCm === 40 && l.wCm === 30 && l.hCm === 20);
      expect(lockedLine).toBeDefined();
      expect(lockedLine?.pcs).toBe(5);
      expect(lockedLine?.locked).toBe(true);
      expect(lockedLine?.estimated).toBe(true);
    }
  });
});
