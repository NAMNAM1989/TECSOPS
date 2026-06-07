import { describe, expect, it } from "vitest";
import {
  buildScscFieldHtmlFromTemplate,
  usesScscLabelTemplate,
} from "./scscPrintPipeline";
import { getBuiltinTemplate } from "../core/defaultTemplates";
import type { A4WeighReceiptPrinterProfile } from "../../printing/printTypes";
import { defaultScscWeighPrintSettings } from "../../printing/scscWeigh/scscWeighPrintSettingsCore";
import type { ScaleTicketFormData } from "../../utils/mapBookingToScaleTicketFormData";

function minimalForm(): ScaleTicketFormData {
  return {
    awb: "738-1234 5678",
    flightNo: "VN1",
    flightDate: "2026-05-16",
    destinationAirport: "NRT",
    pieces: 1,
    grossWeight: 1,
    chargeableWeight: 1,
    goodsDescription: "G",
    shipperName: "S",
    shipperAddress: "A",
    consigneeName: "C",
    consigneeAddress: "B",
    notifyName: "G",
  } as any;
}

const baseProfile = (): A4WeighReceiptPrinterProfile => ({
  id: "test-a4",
  name: "Test A4",
  type: "a4-browser",
  paper: "A4",
  offsetXmm: 0,
  offsetYmm: 0,
  scaleX: 1,
  scaleY: 1,
  templateVersion: "1",
});

describe("scscPrintPipeline", () => {
  it("usesScscLabelTemplate when template has objects", () => {
    const profile = {
      ...baseProfile(),
      labelTemplate: getBuiltinTemplate("scsc-weigh-a4"),
    };
    expect(usesScscLabelTemplate(profile)).toBe(true);
  });

  it("buildScscFieldHtmlFromTemplate wraps layer", () => {
    const profile = {
      ...baseProfile(),
      labelTemplate: getBuiltinTemplate("scsc-weigh-a4"),
    };
    const html = buildScscFieldHtmlFromTemplate(
      minimalForm(),
      profile,
      defaultScscWeighPrintSettings(),
      "translate(1mm, 2mm)"
    );
    expect(html).toContain("label-template-layer");
    expect(html).toContain("translate(1mm, 2mm)");
  });
});
