import { describe, expect, it } from "vitest";
import {
  compactCustomerMatchKey,
  inferLetterKeyFromCustomerCode,
  isValidCustomerSyncCode,
  normalizeCustomerShortCode,
  normalizeCustomerSyncCode,
  shortCodeWhileTyping,
} from "./customerCodeOps";
import { applyCustomsOpsImport } from "./customerCustomsOpsExcel";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";

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

describe("applyCustomsOpsImport", () => {
  it("creates with Customer Code 2–5 chữ", () => {
    const r = applyCustomsOpsImport([], [
      {
        rowNumber: 2,
        code: "GLO",
        name: "Global Forwarding",
        shortCode: "",
        taxCode: "",
        address: "",
        email: "",
        phone: "",
        defaultRate: null,
        customerType: "FORWARDER",
      },
    ]);
    expect(r.created).toBe(1);
    expect(r.customers[0]?.code).toBe("GLO");
    expect(r.customers[0]?.shortCode).toBe("GLO");
    expect(r.customers[0]).not.toHaveProperty("prefix");
  });

  it("updates existing by Customer Code", () => {
    const existing = scaffoldNewCustomer("c1");
    existing.code = "ABC";
    existing.name = "OLD";
    existing.shortCode = "ABC";
    const r = applyCustomsOpsImport([existing], [
      {
        rowNumber: 2,
        code: "ABC",
        name: "ABC Trading",
        shortCode: "ABC",
        taxCode: "",
        address: "",
        email: "",
        phone: "",
        defaultRate: null,
        customerType: "",
      },
    ]);
    expect(r.updated).toBe(1);
    expect(r.created).toBe(0);
    expect(r.customers[0]?.name).toBe("ABC TRADING");
  });

  it("updates khách cũ GLO000001 khi import mã GLO", () => {
    const existing = scaffoldNewCustomer("c1");
    existing.code = "GLO000001";
    existing.name = "OLD";
    const r = applyCustomsOpsImport([existing], [
      {
        rowNumber: 2,
        code: "GLO",
        name: "Global Forwarding",
        shortCode: "GLO",
        taxCode: "",
        address: "",
        email: "",
        phone: "",
        defaultRate: 18500,
        customerType: "FORWARDER",
      },
    ]);
    expect(r.updated).toBe(1);
    expect(r.created).toBe(0);
    expect(r.customers[0]?.code).toBe("GLO000001");
    expect(r.customers[0]?.name).toBe("GLOBAL FORWARDING");
    expect(r.customers[0]?.defaultRate).toBe(18500);
  });

  it("rejects missing Customer Code", () => {
    const r = applyCustomsOpsImport([], [
      {
        rowNumber: 2,
        code: "",
        name: "No Code",
        shortCode: "",
        taxCode: "",
        address: "",
        email: "",
        phone: "",
        defaultRate: null,
        customerType: "",
      },
    ]);
    expect(r.skipped).toBe(1);
    expect(r.errors[0]?.message).toMatch(/Customer Code/);
  });
});
