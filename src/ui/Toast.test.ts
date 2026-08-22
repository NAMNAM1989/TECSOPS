import { describe, expect, it } from "vitest";
import { TOAST_DURATION_MS } from "./Toast";

describe("TOAST_DURATION_MS", () => {
  it("error/warning lâu hơn mặc định — copy nhiều câu từ notify", () => {
    expect(TOAST_DURATION_MS.info).toBe(4200);
    expect(TOAST_DURATION_MS.success).toBe(4200);
    expect(TOAST_DURATION_MS.warning).toBe(5600);
    expect(TOAST_DURATION_MS.danger).toBe(6400);
    expect(TOAST_DURATION_MS.danger).toBeGreaterThan(TOAST_DURATION_MS.info);
    expect(TOAST_DURATION_MS.warning).toBeGreaterThan(TOAST_DURATION_MS.info);
  });
});
