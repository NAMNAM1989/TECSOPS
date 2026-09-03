import { describe, expect, it } from "vitest";
import { formatH21InvoiceCneeDisplay } from "./h21InvoiceCneeFormat";

describe("formatH21InvoiceCneeDisplay", () => {
  it("tách tên công ty khỏi địa chỉ nhúng và bỏ trùng", () => {
    const out = formatH21InvoiceCneeDisplay({
      name:
        "AIR GLOBAL LIMITED Unit 503, 5/F, Harbour Centre, Tower 2, 8 Hok Cheung Street, Hung Hom, Hong Kong +852 9199 8584 / +86 1500 2044 090 Gary@Airglobal.com.hk",
      addressLines: [
        "UNIT 503, 5/F, HARBOUR CENTRE, TOWER 2, 8 HOK CHEUNG STREET, HUNG HOM, HONGKONG",
      ],
      phone: "+852 9199 8584",
    });
    expect(out.nameLine).toBe("AIR GLOBAL LIMITED");
    expect(out.addressLines).toHaveLength(1);
    expect(out.addressLines[0]).toMatch(/Unit 503/i);
    expect(out.phoneLine).toMatch(/\+852 9199 8584/);
    expect(out.emailLine).toMatch(/Airglobal\.com\.hk/i);
  });

  it("bỏ dòng city/country trùng khi địa chỉ INFO KH xuống dòng", () => {
    const out = formatH21InvoiceCneeDisplay({
      name: "AIR GLOBAL LIMITED",
      addressLines: [
        "Unit 503, 5/F, Harbour Centre, Tower 2,",
        "8 Hok Cheung Street, Hung Hom, Hong Kong +852 9199 8584 / +86 1500 2044 090 Gary@Airglobal.com.hk",
        "HUNG HOM, HONGKONG",
      ],
      phone: "+852 9199 8584",
    });
    expect(out.nameLine).toBe("AIR GLOBAL LIMITED");
    expect(out.addressLines.some((l) => /HUNG HOM, HONGKONG/i.test(l))).toBe(false);
    expect(out.addressLines.join(" ")).toMatch(/Hung Hom/i);
    expect(out.phoneLine).toMatch(/\+852 9199 8584/);
    expect(out.emailLine).toMatch(/Airglobal\.com\.hk/i);
    expect(out.addressLines.every((l) => !/\+852/.test(l))).toBe(true);
  });

  it("giữ tên đơn giản khi không có địa chỉ nhúng", () => {
    const out = formatH21InvoiceCneeDisplay({
      name: "Faith Logistics Pte Ltd",
      addressLines: ["39 Woodlands Close #04-30 Mega@Woodlands Singapore 737856"],
      phone: "6565708300",
    });
    expect(out.nameLine).toBe("Faith Logistics Pte Ltd");
    expect(out.addressLines).toEqual([
      "39 Woodlands Close #04-30 Mega@Woodlands Singapore 737856",
    ]);
    expect(out.phoneLine).toBe("6565708300");
  });
});
