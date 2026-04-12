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
    status: "PENDING",
  };
}
