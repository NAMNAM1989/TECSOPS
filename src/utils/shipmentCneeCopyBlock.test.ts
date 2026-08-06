import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  buildShipmentCneeBodyLines,
  buildShipmentCneeCopyBlock,
  buildShipmentCneeDisplayLines,
  buildShipmentCneeMetaLines,
  buildShipmentCustomerDetailSections,
  CUSTOMER_DETAIL_EMPTY,
  formatFlightDateDdMmYyyy,
  formatSessionYmdForCneeCopy,
} from "./shipmentCneeCopyBlock";

function baseShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-05-17",
    warehouse: "TECS-SCSC",
    status: "PENDING",
    customer: "Công ty ABC",
    customerCode: "CYL",
    dest: "MEL",
    flight: "VJ081",
    flightDate: "18MAY",
    awb: "978-1111 2222",
    ...overrides,
  } as Shipment;
}

describe("formatSessionYmdForCneeCopy", () => {
  it("định dạng ddMON, năm", () => {
    expect(formatSessionYmdForCneeCopy("2026-05-17")).toBe("17MAY, 2026");
  });
});

describe("formatFlightDateDdMmYyyy", () => {
  it("chuyển DDMMM sang dd-mm-yyyy", () => {
    expect(formatFlightDateDdMmYyyy("19MAY", 2026)).toBe("19-05-2026");
    expect(formatFlightDateDdMmYyyy("18MAY", 2026)).toBe("18-05-2026");
  });

  it("giữ nguyên ISO yyyy-mm-dd", () => {
    expect(formatFlightDateDdMmYyyy("2026-05-19", 2026)).toBe("19-05-2026");
  });
});

describe("buildShipmentCneeMetaLines", () => {
  it("gồm khách, AWB, chuyến, ngày bay dd-mm-yyyy, DEST", () => {
    expect(buildShipmentCneeMetaLines(baseShipment())).toEqual([
      "Khách: CÔNG TY ABC",
      "AWB: 978-1111 2222",
      "Ngày bay: 18-05-2026",
      "Chuyến bay: VJ081",
      "Dest: MEL",
    ]);
  });
});

describe("buildShipmentCneeDisplayLines", () => {
  it("meta + body CNEE", () => {
    const lines = buildShipmentCneeDisplayLines(
      baseShipment({
        consigneeNamePrint: "ACME PTY LTD",
        consigneeAddressPrint: "1 MAIN ST",
      })
    );
    expect(lines[0]).toBe("Khách: CÔNG TY ABC");
    expect(lines[1]).toBe("AWB: 978-1111 2222");
    expect(lines).toContain("Ngày bay: 18-05-2026");
    expect(lines).toContain("Chuyến bay: VJ081");
    expect(lines).toContain("Dest: MEL");
    expect(lines).toContain("CNEE:");
    expect(lines).toContain("ACME PTY LTD");
    expect(lines).toContain("1 MAIN ST");
  });
});

describe("buildShipmentCneeCopyBlock", () => {
  it("header + date + CNEE từ lô", () => {
    const block = buildShipmentCneeCopyBlock(
      baseShipment({
        consigneeNamePrint: "ACME PTY LTD",
        consigneeAddressPrint: "1 MAIN ST\nMELBOURNE VIC",
        consigneePhonePrint: "0399998888",
      })
    );
    expect(block).toBe(
      [
        "CÔNG TY ABC-MEL VJ081/18MAY",
        "Khách: CÔNG TY ABC",
        "date: 17MAY, 2026",
        "ACME PTY LTD",
        "1 MAIN ST",
        "MELBOURNE VIC",
        "TEL: 0399998888",
      ].join("\n")
    );
  });

  it("lấy CNEE từ danh bạ khi lô chưa có snapshot", () => {
    const directory: CustomerDirectoryEntry[] = [
      {
        id: "c1",
        code: "CYL",
        name: "Công ty ABC",
        parties: [],
        savedConsignees: [
          {
            id: "cn1",
            label: "MEL",
            consigneeName: "SAVED CNEE CO",
            consigneeAddress: "88 QUEEN ST",
            consigneePhone: "0400111222",
            consigneeEmail: "",
            notifyName: "",
          },
        ],
      } as CustomerDirectoryEntry,
    ];
    const block = buildShipmentCneeCopyBlock(baseShipment(), directory);
    expect(block).toContain("SAVED CNEE CO");
    expect(block).toContain("88 QUEEN ST");
    expect(block).toContain("TEL: 0400111222");
  });
});

describe("buildShipmentCustomerDetailSections", () => {
  it("đủ Shipper + CNEE + Tên hàng từ lô", () => {
    const detail = buildShipmentCustomerDetailSections(
      baseShipment({
        shipperNamePrint: "SHIPPER CO",
        shipperAddressPrint: "12 SHIP ST",
        shipperPhonePrint: "0901111222",
        consigneeNamePrint: "ACME PTY LTD",
        consigneeAddressPrint: "1 MAIN ST",
        goodsDescriptionPrint: "GARMENTS",
      }),
    );
    expect(detail.customerName).toBe("CÔNG TY ABC");
    expect(detail.metaSummary).toContain("AWB 978-1111 2222");
    expect(detail.metaSummary).toContain("VJ081");
    expect(detail.metaSummary).toContain("MEL");
    expect(detail.shipperEmpty).toBe(false);
    expect(detail.shipperLines).toContain("SHIPPER CO");
    expect(detail.shipperLines).toContain("TEL: 0901111222");
    expect(detail.cneeEmpty).toBe(false);
    expect(detail.cneeLines).toContain("ACME PTY LTD");
    expect(detail.goodsEmpty).toBe(false);
    expect(detail.goodsLines).toEqual(["GARMENTS"]);
    expect(detail.copyAllText).toContain("SHIPPER:");
    expect(detail.copyAllText).toContain("CNEE:");
    expect(detail.copyAllText).toContain("TÊN HÀNG:");
    expect(detail.copyAllText).toContain("GARMENTS");
    expect(detail.hasContent).toBe(true);
  });

  it("thiếu shipper / goods → Chưa chọn", () => {
    const detail = buildShipmentCustomerDetailSections(
      baseShipment({
        consigneeNamePrint: "ACME PTY LTD",
        consigneeAddressPrint: "1 MAIN ST",
      }),
    );
    expect(detail.shipperEmpty).toBe(true);
    expect(detail.shipperLines).toEqual([CUSTOMER_DETAIL_EMPTY]);
    expect(detail.goodsEmpty).toBe(true);
    expect(detail.goodsLines).toEqual([CUSTOMER_DETAIL_EMPTY]);
    expect(detail.cneeEmpty).toBe(false);
    expect(detail.copyAllText).toContain(`SHIPPER:\n${CUSTOMER_DETAIL_EMPTY}`);
    expect(detail.copyAllText).toContain(`TÊN HÀNG:\n${CUSTOMER_DETAIL_EMPTY}`);
  });

  it("tách tên CNEE khỏi địa chỉ khi dồn một chuỗi", () => {
    const detail = buildShipmentCustomerDetailSections(
      baseShipment({
        consigneeNamePrint: "AUSTRALASIAN MAIL SERVICES 118 DENISON ST HILLSDALE NSW 2036",
        consigneeAddressPrint: "Ph: +61 2 9316 3200\n75 Harrick Road",
        consigneePhonePrint: "613.9338.6622",
      }),
    );
    expect(detail.cnee.name).toBe("AUSTRALASIAN MAIL SERVICES");
    expect(detail.cnee.addressLines[0]).toBe("118 DENISON ST HILLSDALE NSW 2036");
    expect(detail.cnee.addressLines).toContain("Ph: +61 2 9316 3200");
    expect(detail.cnee.contactLines).toContain("TEL: 613.9338.6622");
    // copyAll: dòng trống giữa tên và địa chỉ
    expect(detail.cnee.lines[0]).toBe("AUSTRALASIAN MAIL SERVICES");
    expect(detail.cnee.lines[1]).toBe("");
    expect(detail.cnee.lines[2]).toBe("118 DENISON ST HILLSDALE NSW 2036");
  });

  it("bỏ trùng tên ở đầu dòng địa chỉ", () => {
    const detail = buildShipmentCustomerDetailSections(
      baseShipment({
        consigneeNamePrint: "ACME PTY LTD",
        consigneeAddressPrint: "ACME PTY LTD 1 MAIN ST\nMELBOURNE",
      }),
    );
    expect(detail.cnee.name).toBe("ACME PTY LTD");
    expect(detail.cnee.addressLines[0]).toBe("1 MAIN ST");
    expect(detail.cnee.addressLines).toContain("MELBOURNE");
  });

  it("lấy shipper + goods từ hồ sơ khi lô chưa snapshot", () => {
    const directory: CustomerDirectoryEntry[] = [
      {
        id: "c1",
        code: "CYL",
        name: "Công ty ABC",
        parties: [],
        savedShippers: [
          {
            id: "sh1",
            label: "HCM",
            shipperName: "PCS SHIPPER",
            shipperAddress: "99 SHIP RD",
            shipperPhone: "0281234567",
            shipperEmail: "a@b.com",
            taxCode: "0312345678",
          },
        ],
        defaultShipperId: "sh1",
        savedConsignees: [
          {
            id: "cn1",
            label: "MEL",
            consigneeName: "SAVED CNEE",
            consigneeAddress: "88 QUEEN ST",
            consigneePhone: "",
            consigneeEmail: "",
            notifyName: "",
          },
        ],
        defaultConsigneeId: "cn1",
        savedGoods: [
          {
            id: "g1",
            label: "Garment",
            goodsDescription: "GARMENT ACCESSORIES",
          },
        ],
        defaultGoodsId: "g1",
      } as CustomerDirectoryEntry,
    ];
    const detail = buildShipmentCustomerDetailSections(baseShipment(), directory);
    expect(detail.shipperLines).toContain("PCS SHIPPER");
    expect(detail.shipperLines).toContain("MST: 0312345678");
    expect(detail.cneeLines).toContain("SAVED CNEE");
    expect(detail.goodsLines).toEqual(["GARMENT ACCESSORIES"]);
  });
});

describe("buildShipmentCneeBodyLines", () => {
  it("fallback party CNEE trong danh bạ", () => {
    const directory: CustomerDirectoryEntry[] = [
      {
        id: "c2",
        code: "XYZ",
        name: "XYZ",
        parties: [
          {
            id: "p1",
            type: "CNEE",
            label: "Default",
            content: "PARTY LINE 1\nPARTY LINE 2",
          },
        ],
        savedConsignees: [],
      } as CustomerDirectoryEntry,
    ];
    expect(buildShipmentCneeBodyLines(baseShipment({ customerCode: "XYZ", customer: "XYZ" }), directory)).toEqual([
      "PARTY LINE 1",
      "PARTY LINE 2",
    ]);
  });
});
