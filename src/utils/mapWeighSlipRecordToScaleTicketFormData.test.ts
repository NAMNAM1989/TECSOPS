import { describe, expect, it } from "vitest";
import { mapWeighSlipRecordToScaleTicketFormData } from "./mapWeighSlipRecordToScaleTicketFormData";
import type { WeighSlipRecord } from "../types/weighSlip";

function baseRecord(over: Partial<WeighSlipRecord> = {}): WeighSlipRecord {
  return {
    id: "x",
    status: "draft",
    templateName: "scsc_a4_v1",
    customerId: "",
    customerConsigneeId: "",
    legacyShipmentId: "",
    mawbNo: "738-1234 5678",
    hawbNo: "",
    shipperName: "ACME",
    shipperAddress: "HCM",
    shipperContact: "090",
    shipperEmailFax: "",
    shipperTaxCode: "",
    consigneeName: "CNEE",
    consigneeAddress: "TOKYO",
    consigneeTaxAccount: "",
    notifyAgentName: "AGENT",
    notifyAgentAddress: "",
    notifyAgentContact: "",
    notifyOther: "",
    destinationAirport: "NRT",
    flightNo: "VN123",
    flightDate: "2026-05-16",
    hawbCountStatus: "",
    goodsDescription: "GENERAL",
    hsCode: "",
    pieces: 2,
    grossWeight: 10,
    chargeableWeight: 12,
    dimensions: "60 x 40 x 30 x 2",
    handlingInstruction: "",
    internalNote: "",
    printFormSnapshot: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("mapWeighSlipRecordToScaleTicketFormData", () => {
  it("maps MAWB and destination", () => {
    const fd = mapWeighSlipRecordToScaleTicketFormData(baseRecord());
    expect(fd.awb).toBe("738-1234 5678");
    expect(fd.destination).toBe("NRT");
    expect(fd.totalPieces).toBe("2");
  });

  it("uses snapshot when final", () => {
    const snap = { ...mapWeighSlipRecordToScaleTicketFormData(baseRecord()), awb: "SNAPSHOT" };
    const fd = mapWeighSlipRecordToScaleTicketFormData(
      baseRecord({ status: "final", printFormSnapshot: snap })
    );
    expect(fd.awb).toBe("SNAPSHOT");
  });
});
