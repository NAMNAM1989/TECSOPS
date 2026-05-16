import type { ScaleTicketFormData } from "../utils/mapBookingToScaleTicketFormData";

export type WeighSlipStatus = "draft" | "final" | "archived";

export type WeighSlipRecord = {
  id: string;
  status: WeighSlipStatus;
  templateName: string;
  customerId: string;
  customerConsigneeId: string;
  legacyShipmentId: string;
  mawbNo: string;
  hawbNo: string;
  shipperName: string;
  shipperAddress: string;
  shipperContact: string;
  shipperEmailFax: string;
  shipperTaxCode: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneeTaxAccount: string;
  notifyAgentName: string;
  notifyAgentAddress: string;
  notifyAgentContact: string;
  notifyOther: string;
  destinationAirport: string;
  flightNo: string;
  flightDate: string;
  hawbCountStatus: string;
  goodsDescription: string;
  hsCode: string;
  pieces: number | null;
  grossWeight: number | null;
  chargeableWeight: number | null;
  dimensions: string;
  handlingInstruction: string;
  internalNote: string;
  printFormSnapshot: ScaleTicketFormData | null;
  createdAt: string;
  updatedAt: string;
};

export type WeighSlipDraft = Omit<
  WeighSlipRecord,
  "id" | "status" | "printFormSnapshot" | "createdAt" | "updatedAt"
>;

export type CustomerLookupItem = {
  id: string;
  code: string;
  name: string;
  shipperName: string;
  shipperAddress: string;
  shipperPhone: string;
  shipperEmail: string;
  taxCode: string;
  agentName: string;
  agentAddress: string;
  agentPhone: string;
  agentEmail: string;
  agentTaxCode: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
  consigneeEmail: string;
  notifyName: string;
};

export type ConsigneeLookupItem = {
  id: string;
  label: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
  consigneeEmail: string;
  notifyName: string;
};

export type AirportLookupItem = {
  iata: string;
  name: string;
  country: string;
};
