import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `looksLikePortalAccount` sống trong content script của Ext (không import được).
 * Test trích đúng đoạn mã đang ship để chặn tái diễn bug nhận «Email» là user.
 */
function loadAccountMatcher(file: string): (raw: unknown) => string {
  const source = readFileSync(file, "utf8");
  const from = source.indexOf("const IDENTITY_LABEL_BLOCKLIST");
  const to = source.indexOf("function decodeJwtPayload");
  if (from < 0 || to <= from) {
    throw new Error(`Không tìm thấy khối nhận diện user trong ${file}`);
  }
  const block = source.slice(from, to);
  return new Function(`${block}; return looksLikePortalAccount;`)() as (
    raw: unknown
  ) => string;
}

const EXT_CONTENT_SCRIPTS = [
  "chrome-extension/content-tcs.js",
  "chrome-extension-tcs/content-tcs.js",
];

describe.each(EXT_CONTENT_SCRIPTS)("nhận diện user portal — %s", (file) => {
  const looksLikePortalAccount = loadAccountMatcher(file);

  it("nhận đúng tài khoản kho", () => {
    expect(looksLikePortalAccount("namnam8012")).toBe("namnam8012");
    expect(looksLikePortalAccount("hanam7195")).toBe("hanam7195");
    expect(looksLikePortalAccount("  namnam8012 ")).toBe("namnam8012");
  });

  it("loại nhãn giao diện — gốc của lỗi «Email»", () => {
    for (const label of [
      "Email",
      "Password",
      "Profile",
      "Đăng xuất",
      "Logout",
      "Account",
      "Trang chủ",
      "ESID",
    ]) {
      expect(looksLikePortalAccount(label)).toBe("");
    }
  });

  it("loại chuỗi không phải tài khoản", () => {
    expect(looksLikePortalAccount("")).toBe("");
    expect(looksLikePortalAccount(null)).toBe("");
    expect(looksLikePortalAccount("ab1")).toBe("");
    expect(looksLikePortalAccount("nam nam 8012")).toBe("");
    expect(looksLikePortalAccount("8012namnam")).toBe("");
    expect(looksLikePortalAccount(`${"a".repeat(45)}1`)).toBe("");
  });

  it("bắt buộc có chữ số nên nhãn chữ thuần luôn bị loại", () => {
    expect(looksLikePortalAccount("Notifications")).toBe("");
    expect(looksLikePortalAccount("khachhang")).toBe("");
  });
});
