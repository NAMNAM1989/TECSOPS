import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { lookupCustomerCodeByName } from "./customerDirectoryCore";
import { findCustomerEntry } from "./mapBookingToScaleTicketFormData";

const MONTHS_EN = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function compactToken(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

export function buildInvoiceNumber(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  at: Date = new Date(),
  declarationSeq = 1,
  totalDeclarations = 1
): string {
  const code = resolveCustomerCode(shipment, directory);
  const dest = compactToken(shipment.dest ?? "");
  const ddmmyy = `${pad2(at.getDate())}${pad2(at.getMonth() + 1)}${String(at.getFullYear()).slice(-2)}`;
  const base = `${code}${dest}${ddmmyy}`;
  if (totalDeclarations > 1 || declarationSeq > 1) {
    return `${base}-${String(declarationSeq).padStart(2, "0")}`;
  }
  return base;
}

export function resolveCustomerCode(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): string {
  const fromRow = shipment.customerCode?.trim();
  if (fromRow) return compactToken(fromRow);
  const entry = findCustomerEntry(shipment, directory);
  if (entry?.code?.trim()) return compactToken(entry.code);
  const looked = lookupCustomerCodeByName(directory, shipment.customer);
  return looked ? compactToken(looked) : "";
}

export function formatInvoiceSheetDate(at: Date = new Date()): string {
  const dd = pad2(at.getDate());
  const mon = MONTHS_EN[at.getMonth()] ?? "???";
  return `${dd}${mon},${at.getFullYear()}`;
}

/** Chuyến bay kèm ngày bay trên invoice, ví dụ `SQ185/ 28MAY`. */
export function formatInvoiceFlightLine(
  shipment: Pick<Shipment, "flight" | "flightDate">,
): string {
  const flight = (shipment.flight ?? "").trim().toUpperCase();
  const flightDate = (shipment.flightDate ?? "").trim().toUpperCase();
  if (flight && flightDate) return `${flight}/ ${flightDate}`;
  if (flight) return flight;
  if (flightDate) return flightDate;
  return "";
}

export function sanitizeInvoiceFilePart(s: string): string {
  return s.replace(/[<>:"/\\|?*\s]+/g, "_").slice(0, 80);
}

export function defaultInvoiceXlsxFileName(invoiceNo: string, awb: string): string {
  const awbPart = sanitizeInvoiceFilePart(awb.replace(/\s+/g, ""));
  return `INV_${sanitizeInvoiceFilePart(invoiceNo)}_${awbPart || "AWB"}.xlsx`;
}

export function defaultInvoicePdfFileName(invoiceNo: string, awb: string): string {
  const awbPart = sanitizeInvoiceFilePart(awb.replace(/\s+/g, ""));
  return `INV_${sanitizeInvoiceFilePart(invoiceNo)}_${awbPart || "AWB"}.pdf`;
}
