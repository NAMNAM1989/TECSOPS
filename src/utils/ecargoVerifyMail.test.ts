import { describe, expect, it } from "vitest";
import {
  extractVerifyCode,
  extractVerifyUrl,
  pickFreshVerifyMail,
  verifyMailMatchesBooking,
} from "../../server/ecargo/ecargoVerifyMail.mjs";

const sampleBody = (code: string, extra = "") =>
  `Mã xác thực : ${code}\nhttps://ecargo.scsc.vn/Export/VCTOrder/Verify/${code}\n${extra}`;

describe("ecargoVerifyMail", () => {
  it("parse mã và URL xác thực", () => {
    expect(extractVerifyCode("Mã xác thực : ABC123XYZ")).toBe("ABC123XYZ");
    expect(
      extractVerifyUrl("", [], "ABC123XYZ")
    ).toBe("https://ecargo.scsc.vn/Export/VCTOrder/Verify/ABC123XYZ");
  });

  it("bỏ mail cũ trước submittedAt", () => {
    const submittedAt = Date.parse("2026-05-21T10:00:00Z");
    const candidates = [
      {
        uid: 1,
        raw: sampleBody("OLD111"),
        receivedMs: submittedAt - 120_000,
      },
      {
        uid: 2,
        raw: sampleBody("NEW222"),
        receivedMs: submittedAt + 5_000,
      },
    ];
    const picked = pickFreshVerifyMail(candidates, submittedAt, { mawb: "217-09386543" });
    expect(picked?.verifyCode).toBe("NEW222");
  });

  it("không lấy mail cũ dù là UID cao nhất", () => {
    const submittedAt = Date.parse("2026-05-21T10:00:00Z");
    const candidates = [
      {
        uid: 99,
        raw: sampleBody("STALE99", "MAWB 111-22223333"),
        receivedMs: submittedAt - 60_000,
      },
    ];
    expect(pickFreshVerifyMail(candidates, submittedAt)).toBeNull();
  });

  it("khớp MAWB trong mail để tránh nhầm lô khác", () => {
    const hay = sampleBody("X1", "MAWB 217-09386543 xe 50H17480");
    expect(verifyMailMatchesBooking(hay, { mawb: "217-09386543" })).toBe(true);
    expect(verifyMailMatchesBooking(hay, { mawb: "999-00001111" })).toBe(false);
  });

  it("mail ngắn không có MAWB vẫn được nếu đủ mới", () => {
    const submittedAt = Date.parse("2026-05-21T10:00:00Z");
    const candidates = [
      {
        uid: 3,
        raw: sampleBody("SHORT1"),
        receivedMs: submittedAt + 1000,
      },
    ];
    expect(pickFreshVerifyMail(candidates, submittedAt, { mawb: "217-09386543" })?.verifyCode).toBe(
      "SHORT1"
    );
  });
});
