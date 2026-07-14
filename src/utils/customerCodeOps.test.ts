import { describe, expect, it } from "vitest";
import {
  allocateNextCustomerCode,
  ensureCustomerCodeForSave,
  inferPrefixFromCustomerCode,
  isValidCustomerPrefix,
  normalizeCustomerPrefix,
} from "./customerCodeOps";
import { applyCustomsOpsImport } from "./customerCustomsOpsExcel";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";

describe("customerCodeOps", () => {
  it("normalize prefix 2–5 A-Z", () => {
    expect(normalizeCustomerPrefix("glo-1")).toBe("GLO");
    expect(isValidCustomerPrefix("GLO")).toBe(true);
    expect(isValidCustomerPrefix("G")).toBe(false);
  });

  it("infer prefix from code", () => {
    expect(inferPrefixFromCustomerCode("ABC000001")).toBe("ABC");
    expect(inferPrefixFromCustomerCode("GLO")).toBe("GLO");
  });

  it("allocate sequential codes", () => {
    expect(allocateNextCustomerCode("GLO", [])).toBe("GLO000001");
    expect(allocateNextCustomerCode("GLO", ["GLO000001", "GLO000003"])).toBe("GLO000004");
  });

  it("ensure code from prefix", () => {
    const r = ensureCustomerCodeForSave({ code: "", prefix: "ABC" }, ["ABC000001"]);
    expect(r.code).toBe("ABC000002");
    expect(r.prefix).toBe("ABC");
  });
});

describe("applyCustomsOpsImport", () => {
  it("creates when code empty + prefix", () => {
    const r = applyCustomsOpsImport([], [
      { rowNumber: 2, prefix: "GLO", code: "", name: "Global Forwarding", shortCode: "GLO" },
    ]);
    expect(r.created).toBe(1);
    expect(r.customers[0]?.code).toBe("GLO000001");
    expect(r.customers[0]?.shortCode).toBe("GLO");
  });

  it("updates existing by code", () => {
    const existing = scaffoldNewCustomer("c1");
    existing.prefix = "ABC";
    existing.code = "ABC000001";
    existing.name = "OLD";
    existing.shortCode = "ABC";
    const r = applyCustomsOpsImport([existing], [
      { rowNumber: 2, prefix: "ABC", code: "ABC000001", name: "ABC Trading", shortCode: "ABC" },
    ]);
    expect(r.updated).toBe(1);
    expect(r.created).toBe(0);
    expect(r.customers[0]?.name).toBe("ABC TRADING");
  });

  it("rejects prefix mismatch on update", () => {
    const existing = scaffoldNewCustomer("c1");
    existing.prefix = "ABC";
    existing.code = "ABC000001";
    existing.name = "OLD";
    const r = applyCustomsOpsImport([existing], [
      { rowNumber: 2, prefix: "GLO", code: "ABC000001", name: "X", shortCode: "" },
    ]);
    expect(r.skipped).toBe(1);
    expect(r.errors[0]?.message).toMatch(/Prefix/);
  });
});
