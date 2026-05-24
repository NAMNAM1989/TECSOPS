import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { parseFlightDateDisplayToYmd, ymdToDdMon } from "./bookingDateParse";
import {
  findCustomerEntry,
  resolveSavedConsigneeForBooking,
} from "./mapBookingToScaleTicketFormData";
import { resolvePrintAddressForShipment } from "./printAddressMultiline";

function compactSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function yearHintFromShipment(shipment: Shipment, sessionYmdFallback?: string): number {
  const ymd = shipment.sessionDate?.trim() || sessionYmdFallback?.trim() || "";
  const y = parseInt(ymd.slice(0, 4), 10);
  return Number.isFinite(y) && y >= 2000 ? y : new Date().getFullYear();
}

/** Ngày bay lô (VD `19MAY`) → `dd-mm-yyyy` để hiển thị trong ô CNEE. */
export function formatFlightDateDdMmYyyy(flightDateRaw: string, yearHint: number): string {
  const raw = (flightDateRaw ?? "").trim();
  if (!raw) return "";

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const ymd = parseFlightDateDisplayToYmd(raw, yearHint);
  if (ymd) {
    const [y, m, d] = ymd.split("-");
    return `${d}-${m}-${y}`;
  }
  return raw;
}

/** Ngày nhập liệu (sessionDate YYYY-MM-DD) → `17MAY, 2026`. */
export function formatSessionYmdForCneeCopy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd ?? "").trim());
  if (!m) {
    const t = (ymd ?? "").trim();
    return t || "—";
  }
  const ddmon = ymdToDdMon(ymd);
  if (!ddmon) return (ymd ?? "").trim() || "—";
  return `${ddmon}, ${m[1]}`;
}

function customerTagForCopy(shipment: Shipment): string {
  const code = shipment.customerCode?.trim();
  const name = shipment.customer?.trim();
  return (code || name || "—").toUpperCase();
}

/** Dòng khách hàng trong khối sao chép (mã · tên). */
export function buildShipmentCustomerCopyLine(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): string {
  const entry = findCustomerEntry(shipment, directory);
  const code = (shipment.customerCode?.trim() || entry?.code?.trim() || "").toUpperCase();
  const name = (shipment.customer?.trim() || entry?.name?.trim() || "").toUpperCase();
  if (code && name) return `Khách: ${code} · ${name}`;
  if (name) return `Khách: ${name}`;
  if (code) return `Khách: ${code}`;
  return "";
}

function buildHeaderLine(shipment: Shipment): string {
  const customer = customerTagForCopy(shipment);
  const dest = (shipment.dest ?? "").trim().toUpperCase();
  const customerDest = dest ? `${customer}-${dest}` : customer;

  const flight = (shipment.flight ?? "").trim().toUpperCase();
  const flightDate = (shipment.flightDate ?? "").trim().toUpperCase();
  let flightPart = "";
  if (flight && flightDate) flightPart = `${flight}/${flightDate}`;
  else if (flight) flightPart = flight;
  else if (flightDate) flightPart = flightDate;

  return flightPart ? `${customerDest} ${flightPart}` : customerDest;
}

function splitMultilineBlock(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function cneePartyFallbackLines(entry: CustomerDirectoryEntry | undefined): string[] {
  if (!entry?.parties?.length) return [];
  const parties = entry.parties.filter((p) => p.type === "CNEE" && p.content.trim());
  if (!parties.length) return [];
  return splitMultilineBlock(parties[0].content);
}

/** Các dòng thông tin CNEE (tên, địa chỉ, SĐT, email, notify). */
export function buildShipmentCneeBodyLines(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): string[] {
  const customer = findCustomerEntry(shipment, directory);
  const saved = resolveSavedConsigneeForBooking(shipment, customer);

  const name = compactSpace(shipment.consigneeNamePrint?.trim() || saved?.consigneeName?.trim() || "");
  const address = resolvePrintAddressForShipment({
    bookingPrint: shipment.consigneeAddressPrint,
    directoryPrint: saved?.consigneeAddress ?? "",
    maxLines: 12,
  });
  const phone = compactSpace(shipment.consigneePhonePrint?.trim() || saved?.consigneePhone?.trim() || "");
  const email = compactSpace(shipment.consigneeEmailPrint?.trim() || saved?.consigneeEmail?.trim() || "");
  const notify = compactSpace(shipment.notifyNamePrint?.trim() || saved?.notifyName?.trim() || "");

  const lines: string[] = [];
  if (name) lines.push(name);
  lines.push(...splitMultilineBlock(address));
  if (phone) lines.push(`TEL: ${phone}`);
  if (email) lines.push(`EMAIL: ${email}`);
  if (notify) lines.push(`NOTIFY: ${notify}`);

  if (lines.length === 0) {
    return cneePartyFallbackLines(customer);
  }
  return lines;
}

/** AWB, chuyến, ngày bay (dd-mm-yyyy), DEST — hiển thị phía trên khối CNEE trong ô. */
export function buildShipmentCneeMetaLines(
  shipment: Shipment,
  opts?: { sessionYmdFallback?: string; customerDirectory?: readonly CustomerDirectoryEntry[] }
): string[] {
  const lines: string[] = [];
  const customerLine = buildShipmentCustomerCopyLine(shipment, opts?.customerDirectory ?? []);
  if (customerLine) lines.push(customerLine);
  const awb = (shipment.awb ?? "").trim();
  const flight = (shipment.flight ?? "").trim().toUpperCase();
  const dest = (shipment.dest ?? "").trim().toUpperCase();
  const flightDateDdMmYyyy = formatFlightDateDdMmYyyy(
    shipment.flightDate ?? "",
    yearHintFromShipment(shipment, opts?.sessionYmdFallback)
  );

  if (awb) lines.push(`AWB: ${awb}`);
  if (flightDateDdMmYyyy) lines.push(`Ngày bay: ${flightDateDdMmYyyy}`);
  if (flight) lines.push(`Chuyến bay: ${flight}`);
  if (dest) lines.push(`Dest: ${dest}`);
  return lines;
}

/** Toàn bộ nội dung hiển thị trong panel phóng to CNEE (meta lô + thông tin consignee). */
export function buildShipmentCneeDisplayLines(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  opts?: { sessionYmdFallback?: string }
): string[] {
  const meta = buildShipmentCneeMetaLines(shipment, {
    sessionYmdFallback: opts?.sessionYmdFallback,
    customerDirectory: directory,
  });
  const body = buildShipmentCneeBodyLines(shipment, directory);
  if (meta.length && body.length) return [...meta, "", "CNEE:", ...body];
  if (meta.length) return meta;
  if (body.length) return ["CNEE:", ...body];
  return [];
}

/**
 * Khối sao chép theo lô:
 * ```
 * CYL-MEL VJ081/18MAY
 * date: 17MAY, 2026
 * {CNEE...}
 * ```
 */
export function buildShipmentCneeCopyBlock(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  opts?: { sessionYmdFallback?: string }
): string {
  const sessionYmd =
    shipment.sessionDate?.trim() || opts?.sessionYmdFallback?.trim() || "";
  const header = buildHeaderLine(shipment);
  const customerLine = buildShipmentCustomerCopyLine(shipment, directory);
  const dateLine = `date: ${formatSessionYmdForCneeCopy(sessionYmd)}`;
  const body = buildShipmentCneeBodyLines(shipment, directory);
  const parts = [header];
  if (customerLine) parts.push(customerLine);
  parts.push(dateLine, ...body);
  return parts.join("\n");
}

/** Chi tiết CNEE (địa chỉ, SĐT, email…) — hiển thị trong tooltip, không chiếm ô lưới. */
export function buildShipmentCneeTooltipLines(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  opts?: { sessionYmdFallback?: string }
): string[] {
  const body = buildShipmentCneeBodyLines(shipment, directory);
  if (body.length) return body;
  return buildShipmentCneeMetaLines(shipment, {
    sessionYmdFallback: opts?.sessionYmdFallback,
    customerDirectory: directory,
  });
}

/** Một dòng CNEE chỉ đọc (mobile / gợi ý desktop). */
export function formatShipmentCneeReadonlySummary(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): string {
  const customer = findCustomerEntry(shipment, directory);
  const saved = resolveSavedConsigneeForBooking(shipment, customer);
  const name = compactSpace(shipment.consigneeNamePrint?.trim() || saved?.consigneeName?.trim() || "");
  const label = saved?.label?.trim() || "";
  if (label && name) return `${label} — ${name}`;
  return label || name;
}

export async function copyShipmentCneeBlockToClipboard(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  opts?: { sessionYmdFallback?: string }
): Promise<boolean> {
  const text = buildShipmentCneeCopyBlock(shipment, directory, opts);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
