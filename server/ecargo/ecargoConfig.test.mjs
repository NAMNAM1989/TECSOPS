import { describe, expect, it } from "vitest";
import { isEcargoQrInboxOnly, isEcargoQrSingleScan, isEcargoQrWaitInline } from "./ecargoConfig.mjs";

describe("ecargo QR config", () => {
  it("mặc định không chờ QR inline sau đăng ký", () => {
    expect(isEcargoQrWaitInline()).toBe(false);
  });

  it("mặc định single scan khi bấm Lấy QR", () => {
    expect(isEcargoQrSingleScan()).toBe(true);
  });

  it("mặc định QR chỉ search INBOX", () => {
    expect(isEcargoQrInboxOnly()).toBe(true);
  });
});
