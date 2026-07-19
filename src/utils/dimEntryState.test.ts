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
