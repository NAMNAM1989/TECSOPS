import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  clearDimDraft,
  dimDraftParentChanged,
  loadDimDraft,
  saveDimDraft,
} from "./dimDraftStorage";

describe("dimDraftStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("save/load/clear theo shipmentId", () => {
    saveDimDraft("s1", [{ lCm: 40, wCm: 50, hCm: 30, pcs: 2 }], {
      declaredPcs: 10,
      declaredKg: 100,
    });
    const d = loadDimDraft("s1");
    expect(d?.lines[0]?.pcs).toBe(2);
    expect(d?.declaredPcs).toBe(10);
    clearDimDraft("s1");
    expect(loadDimDraft("s1")).toBeNull();
  });

  it("parentChanged khi pcs/kg đổi", () => {
    const d = saveDimDraft("s1", [{ lCm: 40, wCm: 50, hCm: 30, pcs: 1 }], {
      declaredPcs: 5,
      declaredKg: 50,
    });
    expect(dimDraftParentChanged(d, 5, 50)).toBe(false);
    expect(dimDraftParentChanged(d, 8, 50)).toBe(true);
    expect(dimDraftParentChanged(d, 5, 60)).toBe(true);
  });
});
