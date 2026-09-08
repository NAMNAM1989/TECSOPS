import { describe, expect, it } from "vitest";
import { blankShipmentDraft } from "./blankShipment";
import {
  applyPhieuCanPrintModel,
  buildPhieuCanPrintModel,
  canDownloadPhieuCanExcel,
  PHIEU_CAN_FIXED_AGENT_CELLS,
  PHIEU_CAN_VALUE_CELLS,
} from "./phieuCanExcel";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";

function baseRow(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    ...blankShipmentDraft("2026-09-08", "TECS-SCSC"),
    awb: "97823958255",
    flight: "VJ081",
    flightDate: "06AUG",
    dest: "MEL",
    shipperNamePrint: "GOLDEN LOTUS SERVICE LTD",
    shipperAddressPrint: "02 HOA PHUONG STREET\nC/O UPAK VIETNAM CO.,LTD",
    shipperEmailPrint: "a@b.com",
    taxCodePrint: "0317983327",
    consigneeNamePrint: "SOLID LOGISTICS PTY LTD",
    consigneeAddressPrint: "19-21 MACE WAY MELBOURNE AIRPORT",
    consigneePhonePrint: "03 8336 3500",
    notifyNamePrint: "NOTIFY PARTY",
    goodsDescriptionPrint: "GARMENTS AND DOCUMENTS",
    ...over,
  };
}

describe("phieuCanExcel", () => {
  it("canDownload chỉ SCSC + AWB 11 số", () => {
    expect(canDownloadPhieuCanExcel(baseRow())).toBe(true);
    expect(canDownloadPhieuCanExcel(baseRow({ warehouse: "TECS-TCS" }))).toBe(false);
    expect(canDownloadPhieuCanExcel(baseRow({ awb: "978" }))).toBe(false);
  });

  it("build model: MAWB format, flight/date, NO HAWB, TEL prefix, tách address", () => {
    const m = buildPhieuCanPrintModel(baseRow());
    expect(m.mawb).toBe("978-2395 8255");
    expect(m.flightDate).toBe("VJ081/06AUG");
    expect(m.hawb).toBe("NO HAWB");
    expect(m.consigneePhone).toBe("TEL: 03 8336 3500");
    expect(m.shipperAddress).toBe("02 HOA PHUONG STREET");
    expect(m.shipperAddressExtra).toBe("C/O UPAK VIETNAM CO.,LTD");
    expect(m.dest).toBe("MEL");
    expect(m.goodsDescription).toBe("GARMENTS AND DOCUMENTS");
  });

  it("HAWB có giá trị thì không ghi NO HAWB", () => {
    const m = buildPhieuCanPrintModel(baseRow({ hawb: "H123" }));
    expect(m.hawb).toBe("H123");
  });

  it("fallback danh bạ khi lô chưa snapshot print", () => {
    const directory: CustomerDirectoryEntry[] = [
      {
        id: "c1",
        code: "GL",
        name: "Golden",
        savedShippers: [
          {
            id: "sh1",
            label: "HCM",
            shipperName: "DIR SHIPPER",
            shipperAddress: "DIR ADDR LINE1\nDIR C/O",
            shipperPhone: "",
            shipperEmail: "dir@x.com",
            taxCode: "111",
          },
        ],
        savedConsignees: [
          {
            id: "cn1",
            label: "MEL",
            consigneeName: "DIR CNEE",
            consigneeAddress: "DIR CNEE ADDR",
            consigneePhone: "111",
            consigneeEmail: "",
            notifyName: "DIR NOTIFY",
          },
        ],
        savedGoods: [{ id: "g1", label: "G", goodsDescription: "CLOTHES" }],
        savedVehicles: [],
        parties: [],
      },
    ];
    const row = baseRow({
      customerCode: "GL",
      customerShipperId: "sh1",
      customerConsigneeId: "cn1",
      customerGoodsId: "g1",
      shipperNamePrint: "",
      shipperAddressPrint: "",
      shipperEmailPrint: "",
      taxCodePrint: "",
      consigneeNamePrint: "",
      consigneeAddressPrint: "",
      consigneePhonePrint: "",
      notifyNamePrint: "",
      goodsDescriptionPrint: "",
    });
    const m = buildPhieuCanPrintModel(row, directory);
    expect(m.shipperName).toBe("DIR SHIPPER");
    expect(m.shipperAddressExtra).toBe("DIR C/O");
    expect(m.consigneeName).toBe("DIR CNEE");
    expect(m.notifyName).toBe("DIR NOTIFY");
    expect(m.goodsDescription).toBe("CLOTHES");
  });

  it("apply chỉ ghi ô value, không đụng agent cells trong map", () => {
    const store: Record<string, unknown> = {};
    for (const a of PHIEU_CAN_FIXED_AGENT_CELLS) store[a] = `KEEP-${a}`;
    const sheet = {
      getCell: (addr: string) => ({
        get value() {
          return store[addr];
        },
        set value(v: unknown) {
          store[addr] = v;
        },
      }),
    };
    applyPhieuCanPrintModel(sheet, buildPhieuCanPrintModel(baseRow()));
    for (const a of PHIEU_CAN_FIXED_AGENT_CELLS) {
      expect(store[a]).toBe(`KEEP-${a}`);
    }
    expect(store.O1).toBe("978-2395 8255");
    expect(store.C1).toBe("GOLDEN LOTUS SERVICE LTD");
    expect(store.D20).toBe("NO HAWB");
    expect(PHIEU_CAN_VALUE_CELLS).not.toContain("C6");
  });
});
