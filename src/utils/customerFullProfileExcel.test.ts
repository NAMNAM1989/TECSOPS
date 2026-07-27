import { describe, expect, it } from "vitest";
import {
  applyFullProfileImport,
  buildCustomerFullProfileTemplateWorkbook,
  findCustomerByImportCode,
  parseCustomerFullProfileWorkbook,
} from "./customerFullProfileExcel";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";

describe("parseCustomerFullProfileWorkbook", () => {
  it("đọc mẫu 18 cột — không bỏ dòng dữ liệu đầu (row 2)", async () => {
    const wb = await buildCustomerFullProfileTemplateWorkbook();
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const result = await parseCustomerFullProfileWorkbook(buf);

    expect(result.customerCount).toBe(2);
    const codes = result.customers.map((c) => c.code).sort();
    expect(codes).toEqual(["CITYLINK", "ORIENT"]);

    const city = result.customers.find((c) => c.code === "CITYLINK");
    expect(city?.savedGoods?.[0]?.goodsDescription).toBe("GARMENTS");
    expect(city?.savedConsignees?.[0]?.notifyName).toBe("NOTIFY GLOBAL LOGISTICS");
    expect(city?.savedVehicles?.[0]?.licensePlate).toBe("50H-174.80");
  });

  it("cập nhật khách đã có — ghi đè thông tin account + shipper", async () => {
    const wb = await buildCustomerFullProfileTemplateWorkbook();
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const parsed = await parseCustomerFullProfileWorkbook(buf);

    const existing = scaffoldNewCustomer("c-old");
    existing.code = "CITYLINK";
    existing.name = "Tên cũ";
    existing.address = "Địa chỉ cũ";
    existing.phone = "0900000000";
    existing.savedShippers = [
      {
        id: "shp-old",
        label: "Mặc định",
        shipperName: "Tên cũ",
        shipperAddress: "Địa chỉ cũ",
        shipperPhone: "0900000000",
        shipperEmail: "",
        taxCode: "",
      },
    ];
    existing.defaultShipperId = "shp-old";

    const merged = applyFullProfileImport([existing], parsed.customers);
    expect(merged.updated).toBeGreaterThan(0);
    expect(merged.created).toBe(1);

    const hit = merged.customers.find((c) => c.code === "CITYLINK");
    expect(hit?.name).toContain("PHÁT TRIỂN CITYLINK");
    expect(hit?.address).toContain("Nguyễn Văn Trỗi");
    expect(hit?.phone).toBe("0901234567");
    expect(hit?.savedShippers?.[0]?.shipperEmail).toBe("ops@citylink.vn");
  });

  it("import mã «ĐỨC THẮNG» khớp khách DTE qua shortCode", async () => {
    const dte = scaffoldNewCustomer("dte-id");
    dte.code = "DTE";
    dte.shortCode = "ĐỨC THẮNG";
    dte.name = "ĐỨC THẮNG EXPRESS";
    dte.savedShippers = [
      {
        id: "shp-dte",
        label: "",
        shipperName: "ĐỨC THẮNG EXPRESS",
        shipperAddress: "",
        shipperPhone: "",
        shipperEmail: "",
        taxCode: "",
      },
    ];
    dte.defaultShipperId = "shp-dte";

    expect(findCustomerByImportCode([dte], "DTE")?.id).toBe("dte-id");
    expect(findCustomerByImportCode([dte], "ĐỨC THẮNG")?.id).toBe("dte-id");

    const wb = await buildCustomerFullProfileTemplateWorkbook();
    const ws = wb.worksheets[0]!;
    ws.spliceRows(3, 1);
    ws.getRow(2).getCell(2).value = "ĐỨC THẮNG";
    ws.getRow(2).getCell(5).value = "123 ĐƯỜNG SHORTCODE TEST";
    ws.getRow(2).getCell(9).value = "CNEE SHORTCODE TEST";
    ws.getRow(2).getCell(15).value = "HÀNG SHORTCODE";
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const parsed = await parseCustomerFullProfileWorkbook(buf);
    const merged = applyFullProfileImport([dte], parsed.customers);

    expect(merged.created).toBe(0);
    expect(merged.updated).toBe(1);
    expect(merged.customers).toHaveLength(1);
    expect(merged.customers[0]?.address).toContain("123 ĐƯỜNG SHORTCODE");
    expect(merged.customers[0]?.savedConsignees?.[0]?.consigneeName).toBe(
      "CNEE SHORTCODE TEST",
    );
  });
});
