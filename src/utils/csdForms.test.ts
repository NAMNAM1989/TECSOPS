import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCsdFields,
  canPrintCsd,
  csdCarrierForShipment,
  csdDownloadFilename,
  getCsdCarrierProfile,
  isCsdFdFlight,
  isCsdThFlight,
  normalizeCsdTransfer,
  suggestCsdTransfer,
  wrapCsdGoodsLines,
} from "./csdForms";

describe("csdForms", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("nhận diện chuyến FD / TH qua registry", () => {
    expect(isCsdFdFlight("FD301")).toBe(true);
    expect(isCsdThFlight("TH621")).toBe(true);
    expect(isCsdThFlight("th 621")).toBe(true);
    expect(csdCarrierForShipment({ flight: "VN123" })).toBeNull();
    expect(getCsdCarrierProfile("FD").showTransfer).toBe(true);
    expect(getCsdCarrierProfile("TH").showOrigin).toBe(false);
  });

  it("canPrintCsd cần FD|TH + AWB 11 số", () => {
    expect(canPrintCsd({ flight: "FD301", awb: "217-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "TH621", awb: "217-12345675" })).toBe(true);
    expect(canPrintCsd({ flight: "TH621", awb: "123" })).toBe(false);
  });

  it("build TH: awb + dest + goods + transfer; không ép origin", () => {
    const f = buildCsdFields(
      {
        awb: "21712345675",
        dest: "bkk",
        goodsDescriptionPrint: "CLOTHES PANTS",
      },
      "TH",
      { transfer: "cnx" }
    );
    expect(f.awb.replace(/\D/g, "")).toBe("21712345675");
    expect(f.dest).toBe("BKK");
    expect(f.goods).toBe("CLOTHES PANTS");
    expect(f.origin).toBeUndefined();
    expect(f.transfer).toBe("CNX");
  });

  it("build FD: origin mặc định SGN + transfer", () => {
    const f = buildCsdFields(
      { awb: "21712345675", dest: "HKT", goodsDescriptionPrint: "X" },
      "FD",
      { transfer: "BKK" }
    );
    expect(f.origin).toBe("SGN");
    expect(f.transfer).toBe("BKK");
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

  it("tên file tải về theo AWB", () => {
    expect(csdDownloadFilename("TH", "217-12345675")).toBe(
      "CSD-TH-217-12345675.pdf"
    );
    expect(csdDownloadFilename("FD", "21712345675")).toBe(
      "CSD-FD-217-12345675.pdf"
    );
  });

  it("wrap tên hàng", () => {
    expect(wrapCsdGoodsLines("CLOTHES")).toEqual(["CLOTHES"]);
  });
});
