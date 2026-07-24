import { describe, expect, it, beforeEach } from "vitest";
import {
  loadCustomDimPresets,
  saveCustomDimPreset,
  removeCustomDimPreset,
} from "./dimCustomPresetsStorage";

describe("dimCustomPresetsStorage", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it("loads empty array when no custom presets saved", () => {
    expect(loadCustomDimPresets()).toEqual([]);
  });

  it("saves and retrieves custom dim preset", () => {
    const saved = saveCustomDimPreset({
      label: "Thùng Kho A",
      lCm: 55,
      wCm: 35,
      hCm: 25,
    });
    expect(saved.length).toBe(1);
    expect(saved[0]).toMatchObject({
      label: "Thùng Kho A",
      lCm: 55,
      wCm: 35,
      hCm: 25,
    });

    const loaded = loadCustomDimPresets();
    expect(loaded.length).toBe(1);
    expect(loaded[0]!.label).toBe("Thùng Kho A");
  });

  it("removes custom dim preset by id", () => {
    const list = saveCustomDimPreset({
      id: "preset-1",
      label: "Thùng B",
      lCm: 50,
      wCm: 40,
      hCm: 30,
    });
    expect(list.length).toBe(1);

    const remaining = removeCustomDimPreset("preset-1");
    expect(remaining.length).toBe(0);
    expect(loadCustomDimPresets()).toEqual([]);
  });
});
