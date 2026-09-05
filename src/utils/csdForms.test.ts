import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCsdFields,
  canPrintCsd,
  csdCarrierForShipment,
  csdDownloadFilename,
  csdRaForWarehouse,
  fillCsdPdfBytes,
  formatCsdMhRaCode,
  getCsdCarrierProfile,
  isCsdFdFlight,
  isCsdMhFlight,
  isCsdQrFlight,
  isCsdTgFlight,
  normalizeCsdTransfer,
  suggestCsdTransfer,
  resolveCsdGoodsText,
  wrapCsdGoodsLines,
} from "./csdForms";

describe("csdForms", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("nhận diện chuyến FD / TG / MH / QR qua registry", () => {
    expect(isCsdFdFlight("FD301")).toBe(true);
    expect(isCsdTgFlight("TG621")).toBe(true);
    expect(isCsdTgFlight("tg 621")).toBe(true);
    expect(isCsdMhFlight("MH751")).toBe(true);
    expect(isCsdQrFlight("QR970")).toBe(true);
    expect(csdCarrierForShipment({ flight: "VN123" })).toBeNull();
    expect(csdCarrierForShipment({ flight: "TH621" })).toBeNull();
    expect(getCsdCarrierProfile("FD").showTransfer).toBe(true);
    expect(getCsdCarrierProfile("TG").showOrigin).toBe(true);
    expect(getCsdCarrierProfile("MH").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("QR").showOrigin).toBe(false);
  });

  it("canPrintCsd cần FD|TG|MH|QR + AWB 11 số", () => {
    expect(canPrintCsd({ flight: "FD301", awb: "217-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "TG621", awb: "217-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "MH751", awb: "232-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "QR970", awb: "157-66802024" })).toBe(true);
    expect(canPrintCsd({ flight: "TG621", awb: "123" })).toBe(false);
  });

  it("map mã RA theo 3 kho hoạt động", () => {
    expect(csdRaForWarehouse("TECS-TCS").raCode).toBe("VN/RA3/00013-01");
    expect(csdRaForWarehouse("TECS-SCSC").raCode).toBe("VN/RA3/00013-01");
    expect(csdRaForWarehouse("SCSC").raCode).toBe("VN/RA3/00009-01");
    expect(csdRaForWarehouse("TCS").raCode).toBe("VN/RA3/00010-01");
  });

  it("build TG: awb + dest + goods + origin + transfer + RA", () => {
    const f = buildCsdFields(
      {
        awb: "21712345675",
        dest: "bkk",
        goodsDescriptionPrint: "CLOTHES PANTS",
        warehouse: "SCSC",
      },
      "TG",
      { transfer: "cnx" }
    );
    expect(f.awb.replace(/\D/g, "")).toBe("21712345675");
    expect(f.dest).toBe("BKK");
    expect(f.goods).toBe("CLOTHES PANTS");
    expect(f.origin).toBe("SGN");
    expect(f.transfer).toBe("CNX");
    expect(f.raCode).toBe("VN/RA3/00009-01");
    expect(f.opsTeam).toBe("SCSC");
  });

  it("build FD: origin mặc định SGN + transfer + RA TECS", () => {
    const f = buildCsdFields(
      {
        awb: "21712345675",
        dest: "HKT",
        goodsDescriptionPrint: "X",
        warehouse: "TECS-TCS",
      },
      "FD",
      { transfer: "BKK" }
    );
    expect(f.origin).toBe("SGN");
    expect(f.transfer).toBe("BKK");
    expect(f.raCode).toBe("VN/RA3/00013-01");
  });

  it("normalizeCsdTransfer chuẩn hoá mã IATA", () => {
    expect(normalizeCsdTransfer("bkk / cnx")).toBe("BKK/CNX");
    expect(normalizeCsdTransfer("BKK,DMK")).toBe("BKK/DMK");
    expect(normalizeCsdTransfer("xx")).toBe("");
  });

  it("suggestCsdTransfer: DEST khác BKK/DMK → BKK; MH → KUL; QR → DOH; nhớ lần trước", () => {
    expect(suggestCsdTransfer("HKT", "FD")).toBe("BKK");
    expect(suggestCsdTransfer("BKK", "FD")).toBe("");
    expect(suggestCsdTransfer("PEN", "MH")).toBe("KUL");
    expect(suggestCsdTransfer("KUL", "MH")).toBe("");
    expect(suggestCsdTransfer("JED", "QR")).toBe("DOH");
    expect(suggestCsdTransfer("DOH", "QR")).toBe("");
    localStorage.setItem(
      "tecsops.csd.lastTransfer.v1",
      JSON.stringify({ FD: "DMK" })
    );
    expect(suggestCsdTransfer("HKT", "FD")).toBe("DMK");
  });

  it("tên file tải về: kho_hãng_awb_khách", () => {
    expect(
      csdDownloadFilename({
        carrier: "TG",
        awb: "217-12345675",
        warehouse: "SCSC",
        customerCode: "PCS",
      })
    ).toBe("SCSC_TG_217-12345675_PCS.pdf");
    expect(
      csdDownloadFilename({
        carrier: "FD",
        awb: "21712345675",
        warehouse: "TECS-TCS",
        customer: "Acme Co",
      })
    ).toBe("TECS-TCS_FD_217-12345675_Acme-Co.pdf");
    expect(
      csdDownloadFilename({
        carrier: "MH",
        awb: "232-12345675",
        warehouse: "TCS",
        customerCode: "ABC",
        customer: "Ignored When Code Present",
      })
    ).toBe("TCS_MH_232-12345675_ABC.pdf");
    expect(
      csdDownloadFilename({
        carrier: "QR",
        awb: "157-66802024",
        warehouse: "SCSC",
      })
    ).toBe("SCSC_QR_157-66802024_KHACH.pdf");
  });

  it("format mã RA MH dùng gạch ngang sau RA3", () => {
    expect(formatCsdMhRaCode("VN/RA3/00013-01")).toBe("VN/RA3-00013-01");
    expect(formatCsdMhRaCode("VN/RA3-00010-01")).toBe("VN/RA3-00010-01");
  });

  it("build MH: không ép origin; transfer + RA theo kho", () => {
    const f = buildCsdFields(
      {
        awb: "23212345675",
        dest: "pen",
        goodsDescriptionPrint: "ELECTRONICS",
        warehouse: "TCS",
      },
      "MH",
      { transfer: "kul" }
    );
    expect(f.origin).toBeUndefined();
    expect(f.dest).toBe("PEN");
    expect(f.transfer).toBe("KUL");
    expect(f.raCode).toBe("VN/RA3/00010-01");
    expect(f.opsTeam).toBe("TCS");
  });

  it("build QR: không ép origin; wipe DEST/Transfer mẫu; RA theo kho", () => {
    const f = buildCsdFields(
      {
        awb: "15766802024",
        dest: "jed",
        goodsDescriptionPrint: "FABRICS",
        warehouse: "SCSC",
      },
      "QR",
      { transfer: "doh" }
    );
    expect(f.origin).toBeUndefined();
    expect(f.dest).toBe("JED");
    expect(f.transfer).toBe("DOH");
    expect(f.raCode).toBe("VN/RA3/00009-01");
    expect(f.opsTeam).toBe("SCSC");
  });

  it("wrap tên hàng", () => {
    expect(wrapCsdGoodsLines("CLOTHES")).toEqual(["CLOTHES"]);
  });

  it("tên hàng CSD lấy từ hồ sơ khách khi lô chưa có goodsDescriptionPrint", () => {
    const shipment = {
      awb: "21712345675",
      dest: "BKK",
      goodsDescriptionPrint: "",
      warehouse: "TCS" as const,
      customerGoodsId: "g-clothes",
      customerCode: "PCS",
      customer: "PCS",
    };
    const directory = [
      {
        id: "c1",
        code: "PCS",
        name: "PCS",
        savedGoods: [
          { id: "g-clothes", label: "", goodsDescription: "CLOTHES PANTS" },
        ],
        savedShippers: [],
        savedConsignees: [],
        savedVehicles: [],
        parties: [],
      },
    ];
    expect(resolveCsdGoodsText(shipment, directory)).toBe("CLOTHES PANTS");
    expect(buildCsdFields(shipment, "FD", { customerDirectory: directory }).goods).toBe(
      "CLOTHES PANTS"
    );
    expect(buildCsdFields(shipment, "FD").goods).toBe("");
  });

  it("tên hàng CSD ưu tiên mô tả in trên lô", () => {
    expect(
      resolveCsdGoodsText({
        goodsDescriptionPrint: "SEAFOOD FROZEN",
        customerGoodsId: "g-other",
        customerCode: "X",
        customer: "X",
      })
    ).toBe("SEAFOOD FROZEN");
  });

  it("ghi tên hàng Unicode lên PDF CSD FD", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-FD.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "FD",
      {
        awb: "217-12345675",
        goods: "QUẦN ÁO / GARMENTS",
        dest: "BKK",
        origin: "SGN",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("điền PDF CSD TG vào đúng ô §1–§6 + §14", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-TG.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "TG",
      {
        awb: "217-12345675",
        goods: "CLOTHES PANTS",
        dest: "BKK",
        origin: "SGN",
        transfer: "CNX",
        raCode: "VN/RA3/00013-01",
        opsTeam: "TECS",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("điền PDF CSD MH: AWB + Contents + RA + DEST/Transfer", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-MH.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "MH",
      {
        awb: "232-12345675",
        goods: "ELECTRONICS PARTS",
        dest: "PEN",
        transfer: "KUL",
        raCode: "VN/RA3/00013-01",
        opsTeam: "TECS",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("điền PDF CSD QR: wipe mẫu + ghi AWB/Contents/DEST/Transfer/RA", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-QR.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "QR",
      {
        awb: "157-66802024",
        goods: "CLOTHES PANTS",
        dest: "JED",
        transfer: "DOH",
        raCode: "VN/RA3/00013-01",
        opsTeam: "TECS",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
