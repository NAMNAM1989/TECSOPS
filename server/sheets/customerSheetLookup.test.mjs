import { describe, expect, it } from "vitest";
import {
  buildCustomerLookups,
  compactCustomerMatchKey,
  lookupCustomerCode,
  lookupCustomerId,
} from "./customerSheetLookup.mjs";

describe("customerSheetLookup", () => {
  const customers = [
    { id: "c-atu", code: "ATU", shortCode: "A TÚ", name: "TÚ BÉO" },
    { id: "c-cce", code: "CCE", shortCode: "CÔNG CHÚA", name: "CÔNG CHÚA EXPRESS" },
    { id: "c-hts", code: "HTS", shortCode: "HTS", name: "HTS EXPRESS" },
  ];

  it("compactCustomerMatchKey bỏ dấu và khoảng trắng", () => {
    expect(compactCustomerMatchKey("A TÚ")).toBe("ATU");
    expect(compactCustomerMatchKey("CÔNG CHÚA")).toBe("CONGCHUA");
    expect(compactCustomerMatchKey("CONG CHUA")).toBe("CONGCHUA");
  });

  it("ưu tiên Short Code (A TÚ → ATU / TÚ BÉO)", () => {
    const lookups = buildCustomerLookups(customers);
    expect(lookups.code("A TÚ")).toBe("ATU");
    expect(lookups.id("A TÚ")).toBe("c-atu");
    expect(lookups.code("a tu")).toBe("ATU");
    expect(lookupCustomerCode(customers, "A TÚ")).toBe("ATU");
    expect(lookupCustomerId(customers, "A TÚ")).toBe("c-atu");
  });

  it("khớp Short bỏ khoảng trắng / dấu (CONG CHUA → CCE)", () => {
    expect(lookupCustomerCode(customers, "CONG CHUA")).toBe("CCE");
    expect(lookupCustomerCode(customers, "CÔNG CHÚA")).toBe("CCE");
  });

  it("fallback Customer Code rồi tên đầy đủ", () => {
    expect(lookupCustomerCode(customers, "HTS")).toBe("HTS");
    expect(lookupCustomerCode(customers, "TÚ BÉO")).toBe("ATU");
    expect(lookupCustomerCode(customers, "CÔNG CHÚA EXPRESS")).toBe("CCE");
  });

  it("không khớp → rỗng", () => {
    expect(lookupCustomerCode(customers, "UNKNOWN")).toBe("");
    expect(lookupCustomerId(customers, "")).toBe("");
  });
});
