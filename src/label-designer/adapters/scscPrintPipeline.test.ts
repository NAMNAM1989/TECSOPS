import { describe, expect, it } from "vitest";
import {
  buildScscFieldHtmlFromTemplate,
  usesScscLabelTemplate,
} from "./scscPrintPipeline";
import { getBuiltinTemplate } from "../core/defaultTemplates";
import type { A4WeighReceiptPrinterProfile } from "../../printing/printTypes";
import { defaultScscWeighPrintSettings } from "../../printing/scscWeigh/scscWeighPrintSettingsCore";
import { mapWeighSlipRecordToScaleTicketFormData } from "../../utils/mapWeighSlipRecordToScaleTicketFormData";
import type { WeighSlipRecord } from "../../types/weighSlip";

function minimalForm() {
  const rec: WeighSlipRecord = {
    id: "t",
    status: "draft",
    templateName: "scsc_a4_v1",
    customerId: "",
    customerConsigneeId: "",
    legacyShipmentId: "",
    mawbNo: "738-12345678",
    hawbNo: "",
    shipperName: "S",
    shipperAddress: "A",
    shipperContact: "",
    shipperEmailFax: "",
    shipperTaxCode: "",
    consigneeName: "C",
    consigneeAddress: "B",
    consigneeTaxAccount: "",
    notifyAgentName: "G",
    notifyAgentAddress: "",
    notifyAgentContact: "",
    notifyOther: "",
    destinationAirport: "NRT",
    flightNo: "VN1",
    flightDate: "2026-05-16",
    hawbCountStatus: "",
    goodsDescription: "G",
    hsCode: "",
    pieces: 1,
    grossWeight: 1,
    chargeableWeight: 1,
    dimensions: "",
    handlingInstruction: "",
    internalNote: "",
    printFormSnapshot: null,
    createdAt: "",
    updatedAt: "",
  };
  return mapWeighSlipRecordToScaleTicketFormData(rec);
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
