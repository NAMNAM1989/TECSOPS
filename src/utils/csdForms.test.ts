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
  getCsdCarrierProfile,
  isCsdFdFlight,
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

  it("nhận diện chuyến FD / TG qua registry", () => {
    expect(isCsdFdFlight("FD301")).toBe(true);
    expect(isCsdTgFlight("TG621")).toBe(true);
    expect(isCsdTgFlight("tg 621")).toBe(true);
    expect(csdCarrierForShipment({ flight: "VN123" })).toBeNull();
    expect(csdCarrierForShipment({ flight: "TH621" })).toBeNull();
    expect(getCsdCarrierProfile("FD").showTransfer).toBe(true);
    expect(getCsdCarrierProfile("TG").showOrigin).toBe(true);
  });

  it("canPrintCsd cần FD|TG + AWB 11 số", () => {
    expect(canPrintCsd({ flight: "FD301", awb: "217-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "TG621", awb: "217-12345675" })).toBe(true);
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

  it("suggestCsdTransfer: DEST khác BKK/DMK → BKK; nhớ lần trước", () => {
    expect(suggestCsdTransfer("HKT", "FD")).toBe("BKK");
    expect(suggestCsdTransfer("BKK", "FD")).toBe("");
    localStorage.setItem(
      "tecsops.csd.lastTransfer.v1",
      JSON.stringify({ FD: "DMK" })
    );
    expect(suggestCsdTransfer("HKT", "FD")).toBe("DMK");
  });

  it("tên file tải về theo kho + hãng + AWB", () => {
    expect(csdDownloadFilename("TG", "217-12345675", "SCSC")).toBe(
      "CSD-SCSC-TG-217-12345675.pdf"
    );
    expect(csdDownloadFilename("FD", "21712345675", "TECS")).toBe(
      "CSD-TECS-FD-217-12345675.pdf"
    );
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
});
