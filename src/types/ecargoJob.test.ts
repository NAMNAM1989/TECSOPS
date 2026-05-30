import { describe, expect, it } from "vitest";
import { canFetchEcargoQr, canFetchEcargoQrAction, canRetryEcargoJob, ECARGO_STALE_JOB_MS } from "./ecargoJob";
import type { EcargoJobRecord } from "./ecargoJob";

function job(
  partial: Partial<EcargoJobRecord> & Pick<EcargoJobRecord, "status">
): EcargoJobRecord {
  return {
    shipmentId: "s1",
    status: partial.status,
    updatedAt: partial.updatedAt,
    createdAt: partial.createdAt,
    ...partial,
  };
}

describe("canRetryEcargoJob", () => {
  it("cho phép khi chưa có job hoặc lỗi", () => {
    expect(canRetryEcargoJob(undefined)).toBe(true);
    expect(canRetryEcargoJob(job({ status: "error" }))).toBe(true);
  });

  it("cho phép khi đã xong (đăng ký lại)", () => {
    expect(canRetryEcargoJob(job({ status: "verified" }))).toBe(true);
    expect(canRetryEcargoJob(job({ status: "qr_ready" }))).toBe(true);
  });

  it("chặn khi đang chạy mới", () => {
    expect(
      canRetryEcargoJob(
        job({ status: "verifying", updatedAt: new Date().toISOString() })
      )
    ).toBe(false);
  });

  it("cho phép khi job kẹt quá STALE", () => {
    const stale = new Date(Date.now() - ECARGO_STALE_JOB_MS - 1000).toISOString();
    expect(canRetryEcargoJob(job({ status: "waiting_verify_email", updatedAt: stale }))).toBe(
      true
    );
  });
});

describe("canFetchEcargoQrAction", () => {
  it("cho phép khi verified + markedSubmitted dù thiếu verifyClickedAt", () => {
    expect(
      canFetchEcargoQrAction(
        job({ status: "verified", registrationNo: "REG123" }),
        true
      )
    ).toBe(true);
    expect(canFetchEcargoQr(job({ status: "verified", registrationNo: "REG123" }))).toBe(true);
  });

  it("chặn khi chưa đăng ký", () => {
    expect(canFetchEcargoQrAction(undefined, false)).toBe(false);
    expect(canFetchEcargoQrAction(job({ status: "queued" }), false)).toBe(false);
  });
});
