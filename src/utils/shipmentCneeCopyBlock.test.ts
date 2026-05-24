import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  buildShipmentCneeBodyLines,
  buildShipmentCneeCopyBlock,
  buildShipmentCneeDisplayLines,
  buildShipmentCneeMetaLines,
  buildShipmentCneeTooltipLines,
  formatFlightDateDdMmYyyy,
  formatSessionYmdForCneeCopy,
} from "./shipmentCneeCopyBlock";

function baseShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-05-17",
    warehouse: "KHO-SCSC",
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

describe("buildShipmentCneeTooltipLines", () => {
  it("ưu tiên body CNEE (địa chỉ, SĐT) cho tooltip", () => {
    const lines = buildShipmentCneeTooltipLines(
      baseShipment({
        consigneeNamePrint: "ACME PTY LTD",
        consigneeAddressPrint: "1 MAIN ST",
        consigneePhonePrint: "0399998888",
      })
    );
    expect(lines).toContain("ACME PTY LTD");
    expect(lines).toContain("1 MAIN ST");
    expect(lines).toContain("TEL: 0399998888");
    expect(lines.some((l) => l.startsWith("AWB:"))).toBe(false);
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
