import type { Shipment, Warehouse } from "../types/shipment";
import { formatYmdToFlightDateDdMon } from "./bookingDateParse";

/** Lô trống thêm nhanh vào bảng (session + kho mặc định). */
export function blankShipmentDraft(
  sessionYmd: string,
  warehouse: Warehouse = "TECS-TCS"
): Omit<Shipment, "id" | "stt"> {
  return {
    sessionDate: sessionYmd,
    awb: "",
    hawb: "",
    flight: "",
    flightDate: formatYmdToFlightDateDdMon(sessionYmd),
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "",
    warehouse,
    pcs: null,
    kg: null,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "",
    customerCode: "",
    customerId: "",
    customerConsigneeId: "",
    shipperNamePrint: "",
    shipperAddressPrint: "",
    shipperPhonePrint: "",
    shipperEmailPrint: "",
    taxCodePrint: "",
    agentNamePrint: "",
    agentAddressPrint: "",
    agentPhonePrint: "",
    agentEmailPrint: "",
    agentTaxCodePrint: "",
    consigneeNamePrint: "",
    consigneeAddressPrint: "",
    consigneePhonePrint: "",
    consigneeEmailPrint: "",
    notifyNamePrint: "",
    status: "PENDING",
  };
}
