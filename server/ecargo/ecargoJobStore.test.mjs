import { describe, expect, it } from "vitest";
import {
  isEcargoJobStaleActive,
  shouldBlockEcargoEnqueue,
} from "./ecargoJobStore.mjs";

describe("shouldBlockEcargoEnqueue", () => {
  const fresh = {
    status: "verifying",
    updatedAt: new Date().toISOString(),
  };

  it("chặn job active khi không force", () => {
    expect(shouldBlockEcargoEnqueue(fresh)).toBe(true);
  });

  it("cho phép forceRetry khi lỗi hoặc đã xong", () => {
    expect(shouldBlockEcargoEnqueue({ status: "error" }, { forceRetry: true })).toBe(false);
    expect(shouldBlockEcargoEnqueue({ status: "verified" }, { forceRetry: true })).toBe(false);
  });

  it("forceRetry vẫn chặn job đang chạy thật (<90s)", () => {
    expect(shouldBlockEcargoEnqueue(fresh, { forceRetry: true })).toBe(true);
  });

  it("forceRetry cho phép job active kẹt", () => {
    const stale = {
      status: "waiting_verify_email",
      updatedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    };
    expect(isEcargoJobStaleActive(stale)).toBe(true);
    expect(shouldBlockEcargoEnqueue(stale, { forceRetry: true })).toBe(false);
  });
});
