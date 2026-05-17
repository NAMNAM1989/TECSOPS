import type { ScaleTicketFormData } from "./mapBookingToScaleTicketFormData";
import type { WeighSlipRecord } from "../types/weighSlip";
import { normalizePrintAddressMultiline } from "./printAddressMultiline";

function compact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function formatWeight(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(1);
}

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function formatFlightDatePrint(isoDate: string): string {
  const raw = isoDate.trim();
  if (!raw) return "";
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return raw;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTHS[d.getUTCMonth()] ?? "";
  return mon ? `${day}${mon}` : raw;
}

function buildGoodsLine(r: WeighSlipRecord): string {
  const base = compact(r.goodsDescription) || "GENERAL CARGO";
  const hs = compact(r.hsCode);
  const hi = compact(r.handlingInstruction);
  const parts = [base.slice(0, 60)];
  if (hs) parts.push(`HS: ${hs.slice(0, 24)}`);
  if (hi) parts.push(hi.slice(0, 40));
  return parts.join(" | ").slice(0, 120);
}

function buildConsigneeAddress(r: WeighSlipRecord): string {
  const addr = normalizePrintAddressMultiline(r.consigneeAddress);
  const tax = compact(r.consigneeTaxAccount);
  if (tax && addr) return normalizePrintAddressMultiline(`${addr}\nMST/TK: ${tax}`).slice(0, 300);
  if (tax) return `MST/TK: ${tax}`.slice(0, 110);
  return addr.slice(0, 300);
}

function splitContactEmail(contact: string, emailFax: string): { phone: string; email: string } {
  const c = compact(contact);
  const e = compact(emailFax);
  if (e && !c) return { phone: "", email: e.slice(0, 50) };
  if (c.includes("@") && !e) return { phone: "", email: c.slice(0, 50) };
  return { phone: c.slice(0, 24), email: e.slice(0, 50) };
}

/** Map bản ghi phiếu cân → dữ liệu in (cùng contract với mapBookingToScaleTicketFormData). */
export function mapWeighSlipRecordToScaleTicketFormData(r: WeighSlipRecord): ScaleTicketFormData {
  if (r.printFormSnapshot && r.status === "final") {
    return r.printFormSnapshot;
  }

  const shipperSplit = splitContactEmail(r.shipperContact, r.shipperEmailFax);
  const agentSplit = splitContactEmail(r.notifyAgentContact, "");

  const flightNo = compact(r.flightNo);
  const flightDatePrint = formatFlightDatePrint(r.flightDate);
  const flightLinePrint =
    flightNo && flightDatePrint ? `${flightNo} / ${flightDatePrint}` : flightNo || flightDatePrint;

  const hawbNo = compact(r.hawbNo);
  const hawbDisplay = hawbNo.trim() ? "01 HAWB" : "NO HAWB";

  return {
    awb: compact(r.mawbNo),
    flightNo,
    flightDate: flightDatePrint,
    destination: compact(r.destinationAirport).toUpperCase().slice(0, 3),
    origin: "",
    totalPieces: r.pieces != null && r.pieces > 0 ? String(r.pieces) : "",
    grossWeight: formatWeight(r.grossWeight),
    chargeableWeight: formatWeight(r.chargeableWeight),
    customerCode: "",
    shipperName: compact(r.shipperName).slice(0, 120),
    shipperAddress: normalizePrintAddressMultiline(r.shipperAddress, 2).slice(0, 300),
    shipperPhone: shipperSplit.phone,
    shipperEmail: shipperSplit.email,
    taxCode: compact(r.shipperTaxCode).slice(0, 24),
    agentName: compact(r.notifyAgentName).slice(0, 45),
    agentAddress: normalizePrintAddressMultiline(r.notifyAgentAddress).slice(0, 300),
    agentPhone: agentSplit.phone,
    agentEmail: agentSplit.email,
    agentTaxCode: "",
    consigneeName: compact(r.consigneeName).slice(0, 45),
    consigneeAddress: buildConsigneeAddress(r),
    consigneePhone: "",
    consigneeEmail: "",
    notifyName: compact(r.notifyOther).slice(0, 80),
    note: compact(r.internalNote),
    flightLinePrint,
    dimensionsText: r.dimensions.trim().slice(0, 500),
    goodsDescription: buildGoodsLine(r),
    hawb: hawbNo.slice(0, 48),
    hawbDisplay,
    otherRequirements: "",
  };
}
