import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeMimeBody,
  extractQrImageDataUrl,
  extractVerifyCode,
  extractVerifyUrl,
  extractVerifyUrlFromRaw,
  parseQrMailRaw,
  parseVerifyMailRaw,
  pickFreshQrMail,
  pickFreshVerifyMail,
  isVerifyEcargoMailSubject,
  verifyMailMatchesBooking,
  mawbMatchVariants,
} from "../../server/ecargo/ecargoVerifyMail.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const sampleBody = (code: string, extra = "") =>
  `Mã xác thực : ${code}\nhttps://ecargo.scsc.vn/Export/VCTOrder/Verify/${code}\n${extra}`;

describe("ecargoVerifyMail", () => {
  it("parse mã và URL xác thực", () => {
    expect(extractVerifyCode("Mã xác thực : ABC123XYZ")).toBe("ABC123XYZ");
    expect(
      extractVerifyUrl("", [], "ABC123XYZ")
    ).toBe("https://ecargo.scsc.vn/Export/VCTOrder/Verify/ABC123XYZ");
  });

  it("ưu tiên link xanh «đây» trong HTML mail", () => {
    const raw = `<a href="https://ecargo.scsc.vn/Export/VCTOrder/Verify/MXHGW849004ZQV4U0PF">đây</a>`;
    expect(extractVerifyUrlFromRaw(raw, [], "MXHGW849004ZQV4U0PF")).toBe(
      "https://ecargo.scsc.vn/Export/VCTOrder/Verify/MXHGW849004ZQV4U0PF"
    );
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

  it("mawbMatchVariants gồm dạng có khoảng trắng", () => {
    const v = mawbMatchVariants("618-28847663");
    expect(v).toContain("618-28847663");
    expect(v).toContain("618-2884 7663");
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

  it("không so MAWB trên header SMTP — chỉ nội dung HTML mail", () => {
    const code = "L3D96849016ISC9S7FW";
    const html = [
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(
        `<html><body>Mã xác thực : ${code} ` +
          `<a href="https://ecargo.scsc.vn/Export/VCTOrder/Verify/${code}">đây</a></body></html>`,
        "utf8"
      ).toString("base64"),
    ].join("\r\n");
    const rawMime = `Received: by smtp id 618-28847663-fake-header\r\n${html}`;
    const submittedAt = Date.now() - 120_000;
    const candidates = [{ uid: 420, raw: rawMime, receivedMs: Date.now() - 30_000 }];
    const picked = pickFreshVerifyMail(candidates, submittedAt, {
      mawb: "618-28847663",
      vehicleNo: "50H20421",
    });
    expect(picked?.verifyCode).toBe(code);
  });

  it("trả về tên mailbox kèm uid để worker mark-as-read đúng hộp thư", () => {
    const submittedAt = Date.now() - 60_000;
    const code = "M8KTG849038D6T8PSHY";
    const html = [
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(
        `<html><body>Mã xác thực : ${code} ` +
          `<a href="https://ecargo.scsc.vn/Export/VCTOrder/Verify/${code}">đây</a></body></html>`,
        "utf8"
      ).toString("base64"),
    ].join("\r\n");
    const candidates = [
      { uid: 424, mailbox: "INBOX", raw: html, receivedMs: Date.now() - 5_000 },
    ];
    const picked = pickFreshVerifyMail(candidates, submittedAt, {});
    expect(picked?.uid).toBe(424);
    expect(picked?.mailbox).toBe("INBOX");
    expect(picked?.verifyCode).toBe(code);
  });

  it("chọn mail QR theo số phiếu sau xác thực", () => {
    const afterVerify = Date.parse("2026-05-21T10:05:00Z");
    const candidates = [
      {
        uid: 10,
        raw: "Phiếu đăng ký : REGOLD1\nMã QR trong email",
        envelope: { subject: "Phiếu đăng ký hàng vào kho" },
        receivedMs: afterVerify - 60_000,
      },
      {
        uid: 11,
        raw: "Số REGNEW2\nMã QR cho xe 51C12345",
        envelope: { subject: "Phiếu đăng ký hàng vào kho — REGNEW2" },
        receivedMs: afterVerify + 30_000,
      },
    ];
    const picked = pickFreshQrMail(candidates, afterVerify, { registrationNo: "REGNEW2" });
    expect(picked?.registrationNo).toBe("REGNEW2");
  });

  it("bỏ qua mail xác thực khi chờ QR (subject có Mã xác thực)", () => {
    const afterVerify = Date.now() - 30_000;
    expect(
      isVerifyEcargoMailSubject("[eCargo] Mã xác thực phiếu đăng ký hàng vào kho số ABC123")
    ).toBe(true);
    const candidates = [
      {
        uid: 99,
        raw: "Mã xác thực : M8KTG849038D6T8PSHY",
        envelope: {
          subject: "[eCargo] Mã xác thực phiếu đăng ký hàng vào kho số D6T8PSHY",
        },
        receivedMs: Date.now() - 5_000,
      },
      {
        uid: 100,
        raw: "Số REGQR1\nMã QR",
        envelope: { subject: "Phiếu đăng ký hàng vào kho — REGQR1" },
        receivedMs: Date.now(),
      },
    ];
    const picked = pickFreshQrMail(candidates, afterVerify, { registrationNo: "REGQR1" });
    expect(picked?.uid).toBe(100);
    expect(picked?.registrationNo).toBe("REGQR1");
  });

  it("trích ảnh QR qua cid: trong multipart/related", () => {
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const raw = [
      "Content-Type: multipart/related; boundary=rel-bound",
      "",
      "--rel-bound",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<html><body>Số REGCID1 Mã QR<img src="cid:qr-image-001"></body></html>',
      "--rel-bound",
      "Content-Type: image/png",
      "Content-Transfer-Encoding: base64",
      "Content-ID: <qr-image-001>",
      "",
      tinyPngBase64,
      "--rel-bound--",
    ].join("\r\n");
    const dataUrl = extractQrImageDataUrl(raw);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const parsed = parseQrMailRaw(raw, { subject: "Phiếu đăng ký hàng vào kho — REGCID1" });
    expect(parsed?.registrationNo).toBe("REGCID1");
    expect(parsed?.qrImageDataUrl).toBe(dataUrl);
  });

  it("trích ảnh QR base64 từ attachment PNG trong MIME", () => {
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const raw = [
      "Content-Type: multipart/mixed; boundary=qr-test",
      "",
      "--qr-test",
      "Content-Type: text/plain",
      "",
      "Số REGIMG1",
      "Mã QR",
      "--qr-test",
      "Content-Type: image/png",
      "Content-Transfer-Encoding: base64",
      "",
      tinyPngBase64,
      "--qr-test--",
    ].join("\r\n");
    const dataUrl = extractQrImageDataUrl(raw);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const parsed = parseQrMailRaw(raw, { subject: "Phiếu đăng ký hàng vào kho — REGIMG1" });
    expect(parsed?.registrationNo).toBe("REGIMG1");
    expect(parsed?.qrImageDataUrl).toBe(dataUrl);
    expect(parsed?.hasQrImage).toBe(true);
  });
});
