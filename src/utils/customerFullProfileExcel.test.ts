import { describe, expect, it } from "vitest";
import {
  applyFullProfileImport,
  buildCustomerFullProfileTemplateWorkbook,
  parseCustomerFullProfileWorkbook,
} from "./customerFullProfileExcel";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";

describe("parseCustomerFullProfileWorkbook", () => {
  it(
    "đọc mẫu hồ sơ KH — không bỏ dòng dữ liệu đầu (row 2)",
    async () => {
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
    expect(city?.savedVehicles?.[0]?.label).toBe("Xe cố định");
    expect(city?.savedVehicles?.[0]?.vehicleType).toBe("OTO");
    expect(city?.savedVehicles?.[0]?.driverIdType).toBe("CCCD");
    },
    15_000
  );

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
});
