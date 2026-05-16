import type { ConsigneeLookupItem, CustomerLookupItem, WeighSlipDraft } from "../types/weighSlip";

export function applyCustomerToWeighSlipDraft(
  draft: WeighSlipDraft,
  customer: CustomerLookupItem
): WeighSlipDraft {
  return {
    ...draft,
    customerId: customer.id,
    customerConsigneeId: "",
    shipperName: customer.shipperName || customer.name,
    shipperAddress: customer.shipperAddress,
    shipperContact: customer.shipperPhone,
    shipperEmailFax: customer.shipperEmail,
    shipperTaxCode: customer.taxCode,
    notifyAgentName: customer.agentName,
    notifyAgentAddress: customer.agentAddress,
    notifyAgentContact: customer.agentPhone || customer.agentEmail,
    consigneeName: customer.consigneeName,
    consigneeAddress: customer.consigneeAddress,
    notifyOther: customer.notifyName,
  };
}

export function applyConsigneeToWeighSlipDraft(
  draft: WeighSlipDraft,
  cnee: ConsigneeLookupItem
): WeighSlipDraft {
  return {
    ...draft,
    customerConsigneeId: cnee.id,
    consigneeName: cnee.consigneeName,
    consigneeAddress: cnee.consigneeAddress,
    notifyOther: cnee.notifyName || draft.notifyOther,
  };
}
