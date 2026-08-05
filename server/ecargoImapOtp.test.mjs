import { describe, expect, it } from "vitest";
import { extractOtpFromText } from "./ecargoImapOtp.mjs";

describe("extractOtpFromText", () => {
  it("lấy OTP 6 số có nhãn", () => {
    expect(extractOtpFromText("Ma OTP cua ban: 123456")).toBe("123456");
  });

  it("lấy OTP 6 số đứng riêng", () => {
    expect(extractOtpFromText("Xin chao\n847291\nCam on")).toBe("847291");
  });
});
