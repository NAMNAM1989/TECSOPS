import { describe, expect, it } from "vitest";
import {
  extractEcargoVerifyFromMail,
  extractOtpFromText,
  maskEcargoImapUser,
} from "./ecargoImapOtp.mjs";

describe("extractOtpFromText", () => {
  it("lấy OTP 6 số có nhãn", () => {
    expect(extractOtpFromText("Ma OTP cua ban: 123456")).toBe("123456");
  });

  it("lấy OTP 6 số đứng riêng", () => {
    expect(extractOtpFromText("Xin chao\n847291\nCam on")).toBe("847291");
  });
});

describe("extractEcargoVerifyFromMail", () => {
  it("lấy mã alphanumeric + link xác thực từ mail SCSC", () => {
    const html = `
      <p>Mã xác thực : <b>QSSMB88636480ZWUGWM</b></p>
      <p>Bấm vào <a href="https://ecargo.scsc.vn/Export/VCTOrder/Verify?token=abc123">đây</a> để tiến hành xác thực.</p>
    `;
    const r = extractEcargoVerifyFromMail({
      subject: "[eCargo] Mã xác thực phiếu đăng ký hàng vào kho số 80ZWUGWM",
      text: "Mã xác thực : QSSMB88636480ZWUGWM\nBấm vào đây để tiến hành xác thực.",
      html,
    });
    expect(r.code).toBe("QSSMB88636480ZWUGWM");
    expect(r.otp).toBe("QSSMB88636480ZWUGWM");
    expect(r.vctCode).toBe("80ZWUGWM");
    expect(r.verifyUrl).toContain("ecargo.scsc.vn");
    expect(r.verifyUrl).toMatch(/Verify|token/i);
  });

  it("ưu tiên href gần chữ «đây» hơn link khác trong mail", () => {
    const html = `
      <a href="https://ecargo.scsc.vn/Home">Home</a>
      <p>Bấm vào <a href="https://ecargo.scsc.vn/Export/VCTOrder/Verify?token=real">đây</a> để tiến hành xác thực.</p>
    `;
    const r = extractEcargoVerifyFromMail({
      subject: "[eCargo] Mã xác thực phiếu số ABCDEF12",
      text: "Mã xác thực : QSSMBABCDEF12XXXX",
      html,
    });
    expect(r.verifyUrl).toContain("token=real");
  });

  it("không dùng OTP số thuần làm mã xác thực eCargo", () => {
    const r = extractEcargoVerifyFromMail({
      subject: "Thông báo hệ thống",
      text: "Ma OTP cua ban: 123456\nVui long nhap OTP.",
      html: "",
    });
    expect(r.code).toBe("");
    expect(r.otp).toBe("");
    expect(r.verifyUrl).toBe("");
  });

  it("bỏ dấu ] thừa khi URL chỉ có trong text kiểu [https://...]", () => {
    const r = extractEcargoVerifyFromMail({
      subject: "[eCargo] Mã xác thực phiếu đăng ký hàng vào kho số 14IOH47H",
      text:
        "Mã xác thực : XTOSF88669314IOH47H\nBấm vào đây [https://ecargo.scsc.vn/Export/VCTOrder/Verify/XTOSF88669314IOH47H]\nđể tiến hành xác thực.",
      html: "",
    });
    expect(r.code).toBe("XTOSF88669314IOH47H");
    expect(r.verifyUrl).toBe(
      "https://ecargo.scsc.vn/Export/VCTOrder/Verify/XTOSF88669314IOH47H"
    );
  });
});

describe("maskEcargoImapUser", () => {
  it("che local-part, giữ domain", () => {
    expect(maskEcargoImapUser("ops-ecargo@gmail.com")).toBe("ops***@gmail.com");
  });

  it("email ngắn vẫn mask", () => {
    expect(maskEcargoImapUser("ab@x.co")).toBe("ab***@x.co");
  });
});
