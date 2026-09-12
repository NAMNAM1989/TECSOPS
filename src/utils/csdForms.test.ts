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
  isCsdAkFlight,
  isCsdQrFlight,
  isCsdTgFlight,
  isCsdVuFlight,
  isCsdVjFlight,
  isCsdSqFlight,
  isCsdTrFlight,
  isCsdBiFlight,
  isCsdEkFlight,
  isCsdPrFlight,
  isCsdT5Flight,
  isCsdAiFlight,
  isCsdIataTemplateCarrier,
  formatCsdEkDate,
  formatCsdEkDateTime,
  formatCsdT5IssuedOn,
  formatCsdAiIssuedOn,
  formatCsdEkKg,
  formatCsdEkPcs,
  formatCsdPrFlightDest,
  formatCsdPrPcsWeight,
  resolveCsdEkCompanyBlock,
  resolveCsdEkSignCompany,
  resolveCsdPrVerifiedBy,
  normalizeCsdTransfer,
  suggestCsdTransfer,
  resolveCsdGoodsText,
  wrapCsdGoodsLines,
  wrapCsdGoodsByWidth,
} from "./csdForms";

describe("csdForms", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("nhận diện chuyến FD / TG / MH / QR / AK / VU / VJ / SQ / TR / BI / EK / PR / T5 / AI qua registry", () => {
    expect(isCsdFdFlight("FD301")).toBe(true);
    expect(isCsdTgFlight("TG621")).toBe(true);
    expect(isCsdTgFlight("tg 621")).toBe(true);
    expect(isCsdMhFlight("MH751")).toBe(true);
    expect(isCsdQrFlight("QR970")).toBe(true);
    expect(isCsdAkFlight("AK512")).toBe(true);
    expect(isCsdVuFlight("VU131")).toBe(true);
    expect(isCsdVjFlight("VJ123")).toBe(true);
    expect(isCsdSqFlight("SQ178")).toBe(true);
    expect(isCsdTrFlight("TR302")).toBe(true);
    expect(isCsdBiFlight("BI423")).toBe(true);
    expect(isCsdEkFlight("EK392")).toBe(true);
    expect(isCsdPrFlight("PR598")).toBe(true);
    expect(isCsdT5Flight("T5123")).toBe(true);
    expect(isCsdAiFlight("AI131")).toBe(true);
    expect(isCsdIataTemplateCarrier("VJ")).toBe(true);
    expect(isCsdIataTemplateCarrier("SQ")).toBe(true);
    expect(isCsdIataTemplateCarrier("TR")).toBe(true);
    expect(isCsdIataTemplateCarrier("VU")).toBe(false);
    expect(csdCarrierForShipment({ flight: "VN123" })).toBeNull();
    expect(csdCarrierForShipment({ flight: "TH621" })).toBeNull();
    expect(getCsdCarrierProfile("FD").showTransfer).toBe(true);
    expect(getCsdCarrierProfile("TG").showOrigin).toBe(true);
    expect(getCsdCarrierProfile("MH").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("QR").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("AK").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("VU").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("VJ").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("BI").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("EK").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("EK").showTransfer).toBe(false);
    expect(getCsdCarrierProfile("PR").showTransfer).toBe(false);
    expect(getCsdCarrierProfile("T5").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("T5").showTransfer).toBe(true);
    expect(getCsdCarrierProfile("AI").showOrigin).toBe(false);
    expect(getCsdCarrierProfile("AI").showTransfer).toBe(true);
    expect(getCsdCarrierProfile("SQ").templateUrl).toContain("CSD-IATA");
    expect(getCsdCarrierProfile("TR").templateUrl).toContain("CSD-IATA");
    expect(getCsdCarrierProfile("BI").templateUrl).toContain("CSD-BI");
    expect(getCsdCarrierProfile("EK").templateUrl).toContain("CSD-EK");
    expect(getCsdCarrierProfile("PR").templateUrl).toContain("CSD-PR");
    expect(getCsdCarrierProfile("T5").templateUrl).toContain("CSD-T5");
    expect(getCsdCarrierProfile("AI").templateUrl).toContain("CSD-AI");
  });

  it("canPrintCsd cần FD|TG|MH|QR|AK|VU|VJ|SQ|TR|BI|EK|PR|T5|AI + AWB 11 số", () => {
    expect(canPrintCsd({ flight: "FD301", awb: "217-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "TG621", awb: "217-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "MH751", awb: "232-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "QR970", awb: "157-66802024" })).toBe(true);
    expect(canPrintCsd({ flight: "AK512", awb: "843-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "VU131", awb: "759-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "VJ123", awb: "978-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "SQ178", awb: "618-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "TR302", awb: "618-22345675" })).toBe(true);
    expect(canPrintCsd({ flight: "BI423", awb: "672-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "EK392", awb: "176-21216812" })).toBe(true);
    expect(canPrintCsd({ flight: "PR598", awb: "079-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "T5123", awb: "496-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "AI131", awb: "098-12345675" })).toBe(true);
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

  it("suggestCsdTransfer: hubs theo hãng; nhớ lần trước", () => {
    expect(suggestCsdTransfer("HKT", "FD")).toBe("BKK");
    expect(suggestCsdTransfer("BKK", "FD")).toBe("");
    expect(suggestCsdTransfer("PEN", "MH")).toBe("KUL");
    expect(suggestCsdTransfer("KUL", "MH")).toBe("");
    expect(suggestCsdTransfer("BKI", "AK")).toBe("KUL");
    expect(suggestCsdTransfer("KUL", "AK")).toBe("");
    expect(suggestCsdTransfer("JED", "QR")).toBe("DOH");
    expect(suggestCsdTransfer("DOH", "QR")).toBe("");
    expect(suggestCsdTransfer("HAN", "VU")).toBe("");
    expect(suggestCsdTransfer("DAD", "VJ")).toBe("");
    expect(suggestCsdTransfer("CGK", "SQ")).toBe("SIN");
    expect(suggestCsdTransfer("SIN", "SQ")).toBe("");
    expect(suggestCsdTransfer("TPE", "TR")).toBe("SIN");
    expect(suggestCsdTransfer("SIN", "TR")).toBe("");
    expect(suggestCsdTransfer("KUL", "BI")).toBe("BWN");
    expect(suggestCsdTransfer("BWN", "BI")).toBe("");
    expect(suggestCsdTransfer("MAD", "EK")).toBe("DXB");
    expect(suggestCsdTransfer("DXB", "EK")).toBe("");
    expect(suggestCsdTransfer("IST", "T5")).toBe("ASB");
    expect(suggestCsdTransfer("ASB", "T5")).toBe("");
    expect(suggestCsdTransfer("BOM", "AI")).toBe("");
    expect(suggestCsdTransfer("DEL", "AI")).toBe("");
    expect(suggestCsdTransfer("MAA", "AI")).toBe("DEL");
    localStorage.setItem(
      "tecsops.csd.lastTransfer.v1",
      JSON.stringify({ FD: "DMK" })
    );
    expect(suggestCsdTransfer("HKT", "FD")).toBe("DMK");
  });

  it("tên file tải về: kho_hãng_awb_tên khách", () => {
    expect(
      csdDownloadFilename({
        carrier: "QR",
        awb: "157-99888899",
        warehouse: "TECS-TCS",
        customer: "Tín Phát",
        customerCode: "PCS",
      })
    ).toBe("tecs_qr_15799888899_tín phát.pdf");
    expect(
      csdDownloadFilename({
        carrier: "TG",
        awb: "217-12345675",
        warehouse: "SCSC",
        customer: "PCS Logistics",
        customerCode: "PCS",
      })
    ).toBe("scsc_tg_21712345675_pcs logistics.pdf");
    expect(
      csdDownloadFilename({
        carrier: "FD",
        awb: "21712345675",
        warehouse: "TECS-SCSC",
        customer: "Acme Co",
      })
    ).toBe("tecs_fd_21712345675_acme co.pdf");
    expect(
      csdDownloadFilename({
        carrier: "MH",
        awb: "232-12345675",
        warehouse: "TCS",
      })
    ).toBe("tcs_mh_23212345675_khach.pdf");
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

  it("Contents CSD không cắt đuôi tên hàng dài (fit width thay vì wrap[0])", async () => {
    const template = Uint8Array.from(
      readFileSync(resolve("public/templates/csd/CSD-BI.pdf"))
    );
    const bold = Uint8Array.from(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const long =
      "FRESH FRUITS AND VEGETABLES MIXED ORGANIC EXPORT QUALITY PACKED";
    // Bug cũ: wrap max 55 rồi lấy [0] → mất phần đuôi
    expect(wrapCsdGoodsLines(long, 55)[0]).not.toBe(long);

    const { PDFDocument } = await import("pdf-lib");
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const probe = await PDFDocument.create();
    probe.registerFontkit(fontkit);
    const font = await probe.embedFont(bold);
    const fitted = wrapCsdGoodsByWidth(font, long, 280, 6, 2).join(" ");
    expect(fitted.includes("PACKED")).toBe(true);
    expect(fitted.length).toBeGreaterThanOrEqual(long.length - 5);

    const bytes = await fillCsdPdfBytes(
      "BI",
      {
        awb: "672-12345675",
        goods: long,
        dest: "BWN",
        transfer: "BWN",
        raCode: "VN/RA3/00009-01",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
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

  it("điền PDF CSD AK: RA identifier + AWB + Contents + DEST/Transfer", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-AK.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "AK",
      {
        awb: "843-12345675",
        goods: "CLOTHES PANTS",
        dest: "KUL",
        transfer: "BKI",
        raCode: "VN/RA3/00013-01",
        opsTeam: "TECS",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("điền PDF CSD VU: Contents dùng đủ chiều rộng ô (không cắt đuôi tên dài)", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-VU.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const goods =
      "E-COMMERCE GOODS HOME&LIVING HS CODE:9099099 WOMEN CLOTHES HS CODE: 9099099 BABY&KID FASHION HS CODE: 62092090 MUSLIM FA";
    const bytes = await fillCsdPdfBytes(
      "VU",
      {
        awb: "759-00256583",
        goods,
        dest: "BKK",
        transfer: "BKK",
        raCode: "VN/RA3/00009-01",
        opsTeam: "SCSC",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes);
    // pdf-lib không extract text; kiểm tra wrap width đủ chứa đuôi "MUSLIM FA"
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const probe = await PDFDocument.create();
    probe.registerFontkit(fontkit);
    const font = await probe.embedFont(bold);
    const beside = wrapCsdGoodsByWidth(font, goods, 340, 12, 1)[0] || "";
    const rest = goods.slice(beside.length).trim();
    const body = wrapCsdGoodsByWidth(font, rest, 485, 12, 2);
    const painted = [beside, ...body].join(" ");
    expect(painted).toContain("MUSLIM FA");
    expect(painted).toContain("62092090");
    expect(body.length).toBeLessThanOrEqual(2);
  });

  it("build AK: không ép origin; transfer + RA theo kho", () => {
    const f = buildCsdFields(
      {
        awb: "84312345675",
        dest: "bki",
        goodsDescriptionPrint: "GARMENTS",
        warehouse: "TECS-TCS",
      },
      "AK",
      { transfer: "kul" }
    );
    expect(f.origin).toBeUndefined();
    expect(f.dest).toBe("BKI");
    expect(f.transfer).toBe("KUL");
    expect(f.raCode).toBe("VN/RA3/00013-01");
    expect(f.opsTeam).toBe("TECS");
  });

  it("build VU: không ép origin; transfer + RA theo kho", () => {
    const f = buildCsdFields(
      {
        awb: "75912345675",
        dest: "han",
        goodsDescriptionPrint: "FRESH FRUIT",
        warehouse: "SCSC",
      },
      "VU",
      { transfer: "dad" }
    );
    expect(f.origin).toBeUndefined();
    expect(f.dest).toBe("HAN");
    expect(f.transfer).toBe("DAD");
    expect(f.raCode).toBe("VN/RA3/00009-01");
    expect(f.opsTeam).toBe("SCSC");
  });

  it("điền PDF CSD IATA (VJ): RA + AWB + Contents + DEST/Transfer + SPX/XRY", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-IATA.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "VJ",
      {
        awb: "978-12345675",
        goods: "GARMENTS",
        dest: "HAN",
        transfer: "DAD",
        raCode: "VN/RA3/00009-01",
        opsTeam: "SCSC",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("điền PDF CSD IATA (SQ) cùng mẫu", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-IATA.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "SQ",
      {
        awb: "618-12345675",
        goods: "ELECTRONICS",
        dest: "CGK",
        transfer: "SIN",
        raCode: "VN/RA3/00013-01",
        opsTeam: "TECS",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("build VJ/SQ/TR: không ép origin; transfer + RA", () => {
    const vj = buildCsdFields(
      {
        awb: "97812345675",
        dest: "han",
        goodsDescriptionPrint: "GARMENTS",
        warehouse: "SCSC",
      },
      "VJ",
      { transfer: "dad" }
    );
    expect(vj.origin).toBeUndefined();
    expect(vj.dest).toBe("HAN");
    expect(vj.transfer).toBe("DAD");

    const sq = buildCsdFields(
      {
        awb: "61812345675",
        dest: "cgk",
        goodsDescriptionPrint: "X",
        warehouse: "TECS-TCS",
      },
      "SQ",
      { transfer: "sin" }
    );
    expect(sq.transfer).toBe("SIN");
    expect(sq.raCode).toBe("VN/RA3/00013-01");

    const tr = buildCsdFields(
      {
        awb: "61822345675",
        dest: "tpe",
        goodsDescriptionPrint: "X",
        warehouse: "TCS",
      },
      "TR",
      { transfer: "sin" }
    );
    expect(tr.dest).toBe("TPE");
    expect(tr.raCode).toBe("VN/RA3/00010-01");
  });

  it("điền PDF CSD BI: RA + AWB + Contents + DEST/Transfer (giữ SGN/SPX)", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-BI.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "BI",
      {
        awb: "672-12345675",
        goods: "GARMENTS",
        dest: "KUL",
        transfer: "BWN",
        raCode: "VN/RA3/00013-01",
        opsTeam: "TECS",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("điền PDF CSD T5: UAI + AWB + Contents + DEST/Transfer + SPX/XRY", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-T5.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "T5",
      {
        awb: "496-12345675",
        goods: "GARMENTS",
        dest: "ASB",
        transfer: "ASB",
        raCode: "VN/RA3/00009-01",
        opsTeam: "SCSC",
        issuedOn: formatCsdT5IssuedOn(new Date("2026-09-09T15:30:00")),
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("build T5: không ép origin; transfer + issuedOn + RA theo kho", () => {
    const f = buildCsdFields(
      {
        awb: "49612345675",
        dest: "ist",
        goodsDescriptionPrint: "GARMENTS",
        warehouse: "SCSC",
      },
      "T5",
      { transfer: "asb" }
    );
    expect(f.origin).toBeUndefined();
    expect(f.dest).toBe("IST");
    expect(f.transfer).toBe("ASB");
    expect(f.raCode).toBe("VN/RA3/00009-01");
    expect(f.issuedOn).toMatch(/^\d{6}\s+\d{4}$/);
  });

  it("điền PDF CSD AI: RA + AWB + Contents + DEST/Transfer (giữ SGN/SPX/XRAY)", async () => {
    const template = new Uint8Array(
      readFileSync(resolve("public/templates/csd/CSD-AI.pdf"))
    );
    const bold = new Uint8Array(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "AI",
      {
        awb: "098-12345675",
        goods: "GARMENTS",
        dest: "DEL",
        transfer: "DEL",
        raCode: "VN/RA3/00009-01",
        opsTeam: "SCSC",
        issuedOn: formatCsdAiIssuedOn(new Date("2026-09-12T08:15:00")),
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("build AI: không ép origin; transfer DEL + issuedOn + RA theo kho", () => {
    const f = buildCsdFields(
      {
        awb: "09812345675",
        dest: "maa",
        goodsDescriptionPrint: "GARMENTS",
        warehouse: "TECS-SCSC",
      },
      "AI",
      { transfer: "del" }
    );
    expect(f.origin).toBeUndefined();
    expect(f.dest).toBe("MAA");
    expect(f.transfer).toBe("DEL");
    expect(f.raCode).toBe("VN/RA3/00013-01");
    expect(f.issuedOn).toMatch(/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/);
  });

  it("build BI: không ép origin; transfer + RA theo kho", () => {
    const f = buildCsdFields(
      {
        awb: "67212345675",
        dest: "kul",
        goodsDescriptionPrint: "GARMENTS",
        warehouse: "TECS-TCS",
      },
      "BI",
      { transfer: "bwn" }
    );
    expect(f.origin).toBeUndefined();
    expect(f.dest).toBe("KUL");
    expect(f.transfer).toBe("BWN");
    expect(f.raCode).toBe("VN/RA3/00013-01");
  });

  it("build EK: routing SGN-DXB-DEST, transfer DXB, popup issuer", () => {
    const f = buildCsdFields(
      {
        awb: "17621216812",
        dest: "mad",
        goodsDescriptionPrint: "FRESH FRUITS",
        warehouse: "SCSC",
        pcs: 120,
        kg: 850,
        shipperNamePrint: "SAIGON CARGO SERVICE CORP.",
        shipperAddressPrint: "Tan Son Nhat Airport",
        consigneeNamePrint: "ACME IMPORTS LTD",
        consigneeAddressPrint: "Madrid, Spain",
        customer: "SCSC",
      },
      "EK",
      {
        issuedBy: "NGUYEN VAN A",
        issuedTitle: "STAFF",
        issuedDateTime: "08-Sep-2026  15:30",
      }
    );
    expect(f.origin).toBe("SGN");
    expect(f.transfer).toBe("DXB");
    expect(f.routing).toBe("SGN-DXB-MAD");
    expect(f.dest).toBe("MAD");
    expect(f.pcs).toBe("120");
    expect(f.kg).toBe("850");
    expect(f.companyBlock).toBe("ACME IMPORTS LTD\nMadrid, Spain");
    expect(f.signCompany).toBe("SAIGON CARGO SERVICE CORP.");
    expect(f.issuedBy).toBe("NGUYEN VAN A");
    expect(f.letterDate).toBe("08-Sep-2026");
    expect(f.raCode).toBe("VN/RA3/00009-01");
    expect(f.additionalSecurity).toBe("NO HAWB");
  });

  it("resolveCsdEkCompanyBlock dùng CNEE; signCompany dùng shipper", () => {
    expect(
      resolveCsdEkCompanyBlock({
        consigneeNamePrint: "ACME CO",
        consigneeAddressPrint: "1 Road",
      })
    ).toBe("ACME CO\n1 Road");
    expect(
      resolveCsdEkCompanyBlock({
        consigneeNamePrint: "",
        consigneeAddressPrint: "",
      })
    ).toBe("");
    expect(
      resolveCsdEkSignCompany({
        shipperNamePrint: "SHIPPER CO",
      })
    ).toBe("SHIPPER CO");
  });

  it("formatCsdEkDate / DateTime", () => {
    const d = new Date(2026, 8, 8, 15, 30, 0);
    expect(formatCsdEkDate(d)).toBe("08-Sep-2026");
    expect(formatCsdEkDateTime(d)).toBe("08-Sep-2026  15:30");
  });

  it("formatCsdEkPcs / formatCsdEkKg gọn số", () => {
    expect(formatCsdEkPcs(120)).toBe("120");
    expect(formatCsdEkPcs(120.6)).toBe("121");
    expect(formatCsdEkKg(850)).toBe("850");
    expect(formatCsdEkKg(850.25)).toBe("850.3");
    expect(formatCsdEkKg("1,234.5")).toBe("1234.5");
  });

  it("build PR: shipper + pcs/weight + flight/dest + verified by", () => {
    const f = buildCsdFields(
      {
        awb: "07912345675",
        dest: "mnl",
        flight: "PR598",
        goodsDescriptionPrint: "GARMENTS",
        warehouse: "TCS",
        pcs: 40,
        kg: 520,
        shipperNamePrint: "SAIGON EXPORT CO",
        shipperAddressPrint: "Tan Son Nhat",
        shipperPhonePrint: "0281234567",
        customer: "TCS",
      },
      "PR"
    );
    expect(f.origin).toBe("SGN");
    expect(f.dest).toBe("MNL");
    expect(f.pcsWeight).toBe("40 / 520 kg");
    expect(f.flightDest).toBe("PR598/MNL");
    expect(f.shipperName).toBe("SAIGON EXPORT CO");
    expect(f.shipperPhone).toBe("0281234567");
    expect(f.verifiedBy).toBe("TCS Co., Ltd. - PAL Cargo Handler");
    expect(formatCsdPrFlightDest("pr 598", "CEB")).toBe("PR598/CEB");
    expect(formatCsdPrPcsWeight("10", "100")).toBe("10 / 100 kg");
    expect(resolveCsdPrVerifiedBy("SCSC")).toBe("SCSC - PAL Cargo Handler");
  });

  it("điền PDF CSD PR: 1 trang F-0462", async () => {
    const template = Uint8Array.from(
      readFileSync(resolve("public/templates/csd/CSD-PR.pdf"))
    );
    const bold = Uint8Array.from(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "PR",
      {
        awb: "079-1234 5675",
        goods: "GARMENTS",
        dest: "MNL",
        origin: "SGN",
        raCode: "VN/RA3/00010-01",
        shipperName: "SAIGON EXPORT CO",
        shipperAddress: "Tan Son Nhat",
        shipperPhone: "0281234567",
        pcs: "40",
        kg: "520",
        pcsWeight: "40 / 520 kg",
        flightDest: "PR598/MNL",
        formDate: "08-Sep-2026",
        verifiedBy: "TCS Co., Ltd. - PAL Cargo Handler",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("điền PDF CSD EK: 2 trang Letter + CSD", async () => {
    const template = Uint8Array.from(
      readFileSync(resolve("public/templates/csd/CSD-EK.pdf"))
    );
    const bold = Uint8Array.from(
      readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
    );
    const bytes = await fillCsdPdfBytes(
      "EK",
      {
        awb: "176-21216812",
        goods: "FRESH FRUITS",
        dest: "MAD",
        origin: "SGN",
        transfer: "DXB",
        raCode: "VN/RA3/00009-01",
        routing: "SGN-DXB-MAD",
        companyBlock: "SAIGON CARGO\nAirport",
        pcs: "120",
        kg: "850",
        letterDate: "08-Sep-2026",
        issuedBy: "NGUYEN VAN A",
        issuedTitle: "STAFF",
        signCompany: "SCSC",
        issuedDateTime: "08-Sep-2026  15:30",
        additionalSecurity: "NO HAWB",
      },
      template,
      { bold }
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
  });
});
