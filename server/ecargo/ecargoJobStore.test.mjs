import { describe, expect, it } from "vitest";
import {
  isEcargoJobStaleActive,
  shouldBlockEcargoEnqueue,
  shouldResumeEcargoQrOnly,
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

  it("fetchQrOnly chặn khi đã qr_ready hoặc đang chờ QR active", () => {
    expect(
      shouldBlockEcargoEnqueue(
        { status: "qr_ready", verifyClickedAt: "2026-05-28T10:00:00.000Z" },
        { fetchQrOnly: true }
      )
    ).toBe(true);
    expect(
      shouldBlockEcargoEnqueue(
        { status: "verified_waiting_qr", updatedAt: new Date().toISOString() },
        { fetchQrOnly: true }
      )
    ).toBe(true);
    expect(
      shouldBlockEcargoEnqueue(
        { status: "verified", verifyClickedAt: "2026-05-28T10:00:00.000Z" },
        { fetchQrOnly: true }
      )
    ).toBe(false);
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

describe("shouldResumeEcargoQrOnly", () => {
  it("resume khi đã xác thực nhưng chưa có QR", () => {
    expect(
      shouldResumeEcargoQrOnly({
        status: "verified",
        verifyClickedAt: "2026-05-28T10:00:00.000Z",
        registrationNo: "ABC1234",
      })
    ).toBe(true);
    expect(
      shouldResumeEcargoQrOnly({
        status: "error",
        verifyClickedAt: "2026-05-28T10:00:00.000Z",
        registrationNo: "ABC1234",
        message: "Hết thời gian chờ email QR",
      })
    ).toBe(true);
  });

  it("resume khi verified_waiting_qr (job cũ inline)", () => {
    expect(
      shouldResumeEcargoQrOnly({
        status: "verified_waiting_qr",
        verifyClickedAt: "2026-05-28T10:00:00.000Z",
      })
    ).toBe(true);
  });

  it("không resume khi đã qr_ready hoặc chưa xác thực", () => {
    expect(
      shouldResumeEcargoQrOnly({
        status: "qr_ready",
        verifyClickedAt: "2026-05-28T10:00:00.000Z",
        registrationNo: "ABC1234",
        qrReceivedAt: "2026-05-28T10:05:00.000Z",
      })
    ).toBe(false);
    expect(shouldResumeEcargoQrOnly({ status: "error", message: "cutoff" })).toBe(false);
  });
});
