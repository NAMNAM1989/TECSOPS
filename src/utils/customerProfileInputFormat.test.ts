import { describe, expect, it } from "vitest";
import {
  formatVnPhoneDisplay,
  normalizeAgentCode,
  parseCustomerProfileOcrJson,
  patchShipperFromOcr,
} from "./customerProfileInputFormat";

describe("customerProfileInputFormat", () => {
  it("normalizeAgentCode viết hoa", () => {
    expect(normalizeAgentCode(" ctl ")).toBe("CTL");
  });

  it("formatVnPhoneDisplay chèn dấu chấm", () => {
    expect(formatVnPhoneDisplay("02836363967")).toBe("028.3636.3967");
  });

  it("parseCustomerProfileOcrJson và patch shipper", () => {
    const ocr = parseCustomerProfileOcrJson(
      '{"shipperName":"ACME","shipperAddress":"1 ST","taxCode":"123","shipperPhone":"02836363967"}'
    );
    expect(ocr?.shipperName).toBe("ACME");
    const patch = patchShipperFromOcr(
      {
        id: "1",
        label: "",
        shipperName: "",
        shipperAddress: "",
        shipperPhone: "",
        shipperEmail: "",
        taxCode: "",
      },
      ocr!
    );
    expect(patch.shipperPhone).toBe("028.3636.3967");
  });
});
