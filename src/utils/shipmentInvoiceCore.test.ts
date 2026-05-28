import { describe, expect, it } from "vitest";
import {
  defaultInvoicePdfFileName,
  defaultInvoiceXlsxFileName,
  invoiceExportFileName,
  invoiceExportZipFileName,
} from "./shipmentInvoiceCore";

describe("invoiceExportFileName", () => {
  it("1 tờ khai — invoice_{awb}.xlsx", () => {
    expect(defaultInvoiceXlsxFileName("978-2009 2005")).toBe("invoice_97820092005.xlsx");
    expect(defaultInvoicePdfFileName("98720092005")).toBe("invoice_98720092005.pdf");
  });

  it("nhiều tờ — invoice_{awb}_01", () => {
    expect(invoiceExportFileName("978-2009 2005", 1, 3, "xlsx")).toBe(
      "invoice_97820092005_01.xlsx",
    );
    expect(invoiceExportFileName("97820092005", 2, 3, "pdf")).toBe("invoice_97820092005_02.pdf");
  });

  it("zip tất cả tờ", () => {
    expect(invoiceExportZipFileName("978-2009 2005", "xlsx")).toBe(
      "invoice_97820092005_all.xlsx.zip",
    );
  });
});
