import { describe, expect, it } from "vitest";
import {
  compactCustomerMatchKey,
  inferLetterKeyFromCustomerCode,
  isValidCustomerSyncCode,
  normalizeCustomerShortCode,
  normalizeCustomerSyncCode,
  shortCodeWhileTyping,
} from "./customerCodeOps";

describe("customerCodeOps", () => {
  it("normalize Customer Code 2–5 A-Z", () => {
    expect(normalizeCustomerSyncCode("glo-1")).toBe("GLO");
    expect(isValidCustomerSyncCode("GLO")).toBe(true);
    expect(isValidCustomerSyncCode("G")).toBe(false);
  });

  it("infer letter key from legacy sequential code", () => {
    expect(inferLetterKeyFromCustomerCode("ABC000001")).toBe("ABC");
    expect(inferLetterKeyFromCustomerCode("GLO")).toBe("GLO");
  });

  it("Short Code giữ khoảng trắng giữa từ", () => {
    expect(normalizeCustomerShortCode("công  chúa")).toBe("CÔNG CHÚA");
    expect(shortCodeWhileTyping("CÔNG ")).toBe("CÔNG ");
    expect(normalizeCustomerShortCode("  CÔNG CHÚA  ")).toBe("CÔNG CHÚA");
  });

  it("compactCustomerMatchKey bỏ dấu và khoảng trắng", () => {
    expect(compactCustomerMatchKey("CÔNG CHÚA")).toBe("CONGCHUA");
    expect(compactCustomerMatchKey("CONGCHUA")).toBe("CONGCHUA");
    expect(compactCustomerMatchKey("MR.PHI")).toBe("MRPHI");
  });
});
