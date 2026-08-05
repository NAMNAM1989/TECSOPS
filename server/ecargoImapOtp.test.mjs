import { describe, expect, it } from "vitest";
import { extractOtpFromText, maskEcargoImapUser } from "./ecargoImapOtp.mjs";

describe("extractOtpFromText", () => {
  it("lấy OTP 6 số có nhãn", () => {
    expect(extractOtpFromText("Ma OTP cua ban: 123456")).toBe("123456");
  });

  it("lấy OTP 6 số đứng riêng", () => {
    expect(extractOtpFromText("Xin chao\n847291\nCam on")).toBe("847291");
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
