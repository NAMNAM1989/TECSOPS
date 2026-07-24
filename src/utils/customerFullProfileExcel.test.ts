import { describe, expect, it } from "vitest";
import * as fs from "fs";
import { parseCustomerFullProfileWorkbook } from "./customerFullProfileExcel";
import { applyFullProfileImport } from "./customerCustomsOpsExcel";

describe("parseCustomerFullProfileWorkbook", () => {
  it("đọc và bóc tách thành công file Excel 22 cột thực tế", async () => {
    const fileFilePath = `C:\\Users\\Admin\\Documents\\DANH SACHHKHACH HANG\\Copy of customer-import-template.2.xlsx`;
    if (!fs.existsSync(fileFilePath)) {
      console.warn("File không tồn tại trên hệ thống test local, bỏ qua test đọc file đĩa.");
      return;
    }

    const buffer = fs.readFileSync(fileFilePath);
    const result = await parseCustomerFullProfileWorkbook(buffer);

    expect(result.customerCount).toBeGreaterThan(0);
    expect(result.consigneeCount).toBeGreaterThan(0);

    // Kiểm tra thông tin mã CCE trong kết quả đọc
    const cce = result.customers.find((c) => c.code === "CCE");
    expect(cce).toBeDefined();
    if (cce) {
      expect(cce.name).toContain("NAM NAM LOGISTICS");
      expect(cce.savedConsignees).toBeDefined();
      expect(cce.savedConsignees!.length).toBeGreaterThan(0);
      
      // Kiểm tra có CNEE SYD và TPE
      const hasSyd = cce.savedConsignees!.some((c) => c.label.includes("SYD"));
      const hasTpe = cce.savedConsignees!.some((c) => c.label.includes("TPE"));
      expect(hasSyd).toBe(true);
      expect(hasTpe).toBe(true);
    }

    // Kiểm tra hợp nhất vào danh bạ rỗng
    const importRes = applyFullProfileImport([], result.customers);
    expect(importRes.created).toBe(result.customerCount);
    expect(importRes.consigneesAdded).toBe(result.consigneeCount);
  });
});
