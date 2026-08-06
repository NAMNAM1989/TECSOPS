import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { parseFlightDateDisplayToYmd, ymdToDdMon } from "./bookingDateParse";
import {
  findCustomerEntry,
  resolveSavedConsigneeForBooking,
  resolveSavedGoodsForBooking,
  resolveSavedShipperForBooking,
} from "./customerBookingResolve";
import { resolvePrintAddressForShipment } from "./printAddressMultiline";

/** Placeholder section khi chưa chọn Shipper / CNEE / Tên hàng. */
export const CUSTOMER_DETAIL_EMPTY = "Chưa chọn";

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

function customerNameForCneeDisplay(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): string {
  const entry = findCustomerEntry(shipment, directory);
  const name = shipment.customer?.trim() || entry?.name?.trim() || "";
  return name.toUpperCase();
}

/** Dòng khách hàng trong khối CNEE / sao chép — chỉ tên, không mã. */
export function buildShipmentCustomerCopyLine(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): string {
  const name = customerNameForCneeDisplay(shipment, directory);
  if (name) return `Khách: ${name}`;
  return "";
}

function buildHeaderLine(shipment: Shipment, directory: readonly CustomerDirectoryEntry[] = []): string {
  const customer = customerNameForCneeDisplay(shipment, directory);
  if (!customer) {
    const dest = (shipment.dest ?? "").trim().toUpperCase();
    const flight = (shipment.flight ?? "").trim().toUpperCase();
    const flightDate = (shipment.flightDate ?? "").trim().toUpperCase();
    let flightPart = "";
    if (flight && flightDate) flightPart = `${flight}/${flightDate}`;
    else if (flight) flightPart = flight;
    else if (flightDate) flightPart = flightDate;
    return flightPart ? `${dest} ${flightPart}`.trim() : dest;
  }
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

export type BuildShipmentCneeBodyLinesOptions = {
  /** Invoice HQ — không in email CNEE. */
  omitEmail?: boolean;
};

export type CustomerDetailPartyBlock = {
  name: string;
  addressLines: string[];
  contactLines: string[];
  empty: boolean;
  /** Flat: tên · (dòng trống) · địa chỉ · liên hệ — dùng copy / tương thích cũ. */
  lines: string[];
};

/** Tách «TÊN 118 STREET…» → tên + dòng địa chỉ (khi name/address bị dồn 1 chuỗi). */
function peelStreetSuffixFromName(name: string): { name: string; street: string } {
  const m = name.match(/^(.+?)\s+(\d{1,5}\s+.+)$/);
  if (!m) return { name, street: "" };
  const head = compactSpace(m[1] || "");
  const street = compactSpace(m[2] || "");
  if (head.length < 3 || street.length < 5) return { name, street: "" };
  return { name: head, street };
}

/** Bỏ trùng tên ở đầu dòng địa chỉ. */
function stripLeadingNameFromAddress(name: string, addressLines: string[]): string[] {
  if (!name || !addressLines.length) return addressLines;
  const first = addressLines[0]!;
  const prefix = `${name} `;
  if (first.toUpperCase().startsWith(prefix.toUpperCase())) {
    const rest = first.slice(name.length).trim();
    return rest ? [rest, ...addressLines.slice(1)] : addressLines.slice(1);
  }
  return addressLines;
}

/**
 * Tách Ph:/E:/Tel:/Email: nhúng trong địa chỉ → Liên hệ (TEL:/EMAIL:).
 * VD: `118 DENISON ST … Ph: +61 2 9316 3200 E: a@b.com`
 */
function peelEmbeddedContactsFromAddress(addressLines: string[]): {
  addressLines: string[];
  contactLines: string[];
} {
  const contactLines: string[] = [];
  const nextAddress: string[] = [];
  const telRe =
    /(?:^|\s)(?:Ph|Phone|Tel|TEL|Telephone)\s*[:.]\s*(.+?)(?=\s+(?:E|Email|EMAIL|Mail)\s*[:.]|$)/i;
  const emailRe = /(?:^|\s)(?:E|Email|EMAIL|Mail)\s*[:.]\s*(\S+)/i;

  for (const raw of addressLines) {
    let line = raw;
    const telM = telRe.exec(line);
    if (telM) {
      contactLines.push(`TEL: ${compactSpace(telM[1]!)}`);
      line = `${line.slice(0, telM.index)}${line.slice(telM.index + telM[0].length)}`
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    const emailM = emailRe.exec(line);
    if (emailM) {
      contactLines.push(`EMAIL: ${compactSpace(emailM[1]!)}`);
      line = `${line.slice(0, emailM.index)}${line.slice(emailM.index + emailM[0].length)}`
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    if (line) nextAddress.push(line);
  }

  return { addressLines: nextAddress, contactLines };
}

function mergeContactLines(primary: string[], extracted: string[]): string[] {
  const out = [...primary];
  const hasTel = out.some((l) => /^TEL:/i.test(l));
  const hasEmail = out.some((l) => /^EMAIL:/i.test(l));
  for (const line of extracted) {
    if (/^TEL:/i.test(line) && hasTel) continue;
    if (/^EMAIL:/i.test(line) && hasEmail) continue;
    if (out.some((x) => x.toUpperCase() === line.toUpperCase())) continue;
    out.push(line);
  }
  return out;
}

function partyBlockFromParts(opts: {
  name: string;
  addressLines: string[];
  contactLines: string[];
}): CustomerDetailPartyBlock {
  let name = compactSpace(opts.name);
  let addressLines = opts.addressLines.map(compactSpace).filter(Boolean);

  const peeled = peelStreetSuffixFromName(name);
  if (peeled.street) {
    name = peeled.name;
    const already =
      addressLines[0] &&
      addressLines[0].toUpperCase().startsWith(peeled.street.toUpperCase());
    if (!already) addressLines = [peeled.street, ...addressLines];
  }
  addressLines = stripLeadingNameFromAddress(name, addressLines);

  const peeledContacts = peelEmbeddedContactsFromAddress(addressLines);
  addressLines = peeledContacts.addressLines;

  const contactLines = mergeContactLines(
    opts.contactLines.map(compactSpace).filter(Boolean),
    peeledContacts.contactLines,
  );
  const empty = !name && !addressLines.length && !contactLines.length;
  if (empty) {
    return {
      name: "",
      addressLines: [],
      contactLines: [],
      empty: true,
      lines: [CUSTOMER_DETAIL_EMPTY],
    };
  }

  const lines: string[] = [];
  if (name) lines.push(name);
  if (name && addressLines.length) lines.push("");
  lines.push(...addressLines);
  lines.push(...contactLines);
  return { name, addressLines, contactLines, empty: false, lines };
}

/** Các dòng thông tin CNEE (tên, địa chỉ, SĐT, email, notify). */
export function buildShipmentCneeBodyLines(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  opts?: BuildShipmentCneeBodyLinesOptions
): string[] {
  const block = buildShipmentCneePartyBlock(shipment, directory, opts);
  if (block.empty) {
    return cneePartyFallbackLines(findCustomerEntry(shipment, directory));
  }
  // Copy / display cũ: tên rồi địa chỉ liền (không dòng trống).
  return [
    ...(block.name ? [block.name] : []),
    ...block.addressLines,
    ...block.contactLines,
  ];
}

/** CNEE tách tên / địa chỉ / liên hệ — dùng panel chi tiết. */
export function buildShipmentCneePartyBlock(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  opts?: BuildShipmentCneeBodyLinesOptions,
): CustomerDetailPartyBlock {
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

  const contactLines: string[] = [];
  if (phone) contactLines.push(`TEL: ${phone}`);
  if (email && !opts?.omitEmail) contactLines.push(`EMAIL: ${email}`);
  if (notify) contactLines.push(`NOTIFY: ${notify}`);

  const block = partyBlockFromParts({
    name,
    addressLines: splitMultilineBlock(address),
    contactLines,
  });

  if (block.empty) {
    const fallback = cneePartyFallbackLines(customer);
    if (!fallback.length) return block;
    // Fallback party text: dòng đầu = tên, còn lại = địa chỉ (ước lượng).
    return partyBlockFromParts({
      name: fallback[0] || "",
      addressLines: fallback.slice(1),
      contactLines: [],
    });
  }
  return block;
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

function buildShipmentShipperPartyBlock(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
): CustomerDetailPartyBlock {
  const customer = findCustomerEntry(shipment, directory);
  const saved = resolveSavedShipperForBooking(shipment, customer);

  const name = compactSpace(shipment.shipperNamePrint?.trim() || saved?.shipperName?.trim() || "");
  const address = resolvePrintAddressForShipment({
    bookingPrint: shipment.shipperAddressPrint,
    directoryPrint: saved?.shipperAddress ?? "",
    maxLines: 8,
  });
  const phone = compactSpace(shipment.shipperPhonePrint?.trim() || saved?.shipperPhone?.trim() || "");
  const email = compactSpace(shipment.shipperEmailPrint?.trim() || saved?.shipperEmail?.trim() || "");
  const tax = compactSpace(shipment.taxCodePrint?.trim() || saved?.taxCode?.trim() || "");

  const contactLines: string[] = [];
  if (phone) contactLines.push(`TEL: ${phone}`);
  if (email) contactLines.push(`EMAIL: ${email}`);
  if (tax) contactLines.push(`MST: ${tax}`);

  return partyBlockFromParts({
    name,
    addressLines: splitMultilineBlock(address),
    contactLines,
  });
}

function buildShipmentGoodsBodyLines(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
): string[] {
  const customer = findCustomerEntry(shipment, directory);
  const saved = resolveSavedGoodsForBooking(shipment, customer);
  const desc = compactSpace(
    shipment.goodsDescriptionPrint?.trim() || saved?.goodsDescription?.trim() || "",
  );
  return desc ? [desc] : [];
}

function sectionOrEmpty(lines: string[]): { lines: string[]; empty: boolean } {
  if (lines.length) return { lines, empty: false };
  return { lines: [CUSTOMER_DETAIL_EMPTY], empty: true };
}

export type ShipmentCustomerDetailSections = {
  customerName: string;
  /** Một dòng meta: AWB · chuyến · ngày · Dest */
  metaSummary: string;
  metaLines: string[];
  shipper: CustomerDetailPartyBlock;
  cnee: CustomerDetailPartyBlock;
  shipperLines: string[];
  cneeLines: string[];
  goodsLines: string[];
  shipperEmpty: boolean;
  cneeEmpty: boolean;
  goodsEmpty: boolean;
  copyAllText: string;
  hasContent: boolean;
};

/**
 * Panel thông tin khách đầy đủ: meta lô + Shipper + CNEE + Tên hàng.
 * Ưu tiên `*Print` trên lô, thiếu thì lấy hồ sơ đã chọn.
 */
export function buildShipmentCustomerDetailSections(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  opts?: { sessionYmdFallback?: string },
): ShipmentCustomerDetailSections {
  const customerName = customerNameForCneeDisplay(shipment, directory);
  const awb = (shipment.awb ?? "").trim();
  const flight = (shipment.flight ?? "").trim().toUpperCase();
  const dest = (shipment.dest ?? "").trim().toUpperCase();
  const flightDateDdMmYyyy = formatFlightDateDdMmYyyy(
    shipment.flightDate ?? "",
    yearHintFromShipment(shipment, opts?.sessionYmdFallback),
  );

  const metaParts: string[] = [];
  if (awb) metaParts.push(`AWB ${awb}`);
  if (flight) metaParts.push(flight);
  if (flightDateDdMmYyyy) metaParts.push(flightDateDdMmYyyy);
  if (dest) metaParts.push(dest);
  const metaSummary = metaParts.join(" · ");

  const metaLines: string[] = [];
  if (awb) metaLines.push(`AWB: ${awb}`);
  if (flightDateDdMmYyyy) metaLines.push(`Ngày bay: ${flightDateDdMmYyyy}`);
  if (flight) metaLines.push(`Chuyến bay: ${flight}`);
  if (dest) metaLines.push(`Dest: ${dest}`);

  const shipper = buildShipmentShipperPartyBlock(shipment, directory);
  const cnee = buildShipmentCneePartyBlock(shipment, directory);
  const goods = sectionOrEmpty(buildShipmentGoodsBodyLines(shipment, directory));

  const copyParts: string[] = [];
  if (customerName) copyParts.push(`Khách: ${customerName}`);
  copyParts.push(...metaLines);
  if (copyParts.length) copyParts.push("");
  copyParts.push("SHIPPER:", ...shipper.lines, "", "CNEE:", ...cnee.lines, "", "TÊN HÀNG:", ...goods.lines);

  const hasContent = Boolean(
    customerName ||
      metaLines.length ||
      !shipper.empty ||
      !cnee.empty ||
      !goods.empty,
  );

  return {
    customerName,
    metaSummary,
    metaLines,
    shipper,
    cnee,
    shipperLines: shipper.lines,
    cneeLines: cnee.lines,
    goodsLines: goods.lines,
    shipperEmpty: shipper.empty,
    cneeEmpty: cnee.empty,
    goodsEmpty: goods.empty,
    copyAllText: copyParts.join("\n").trim(),
    hasContent,
  };
}

/**
 * Khối sao chép theo lô:
 * ```
 * CÔNG TY ABC-MEL VJ081/18MAY
 * Khách: CÔNG TY ABC
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
  const header = buildHeaderLine(shipment, directory);
  const customerLine = buildShipmentCustomerCopyLine(shipment, directory);
  const dateLine = `date: ${formatSessionYmdForCneeCopy(sessionYmd)}`;
  const body = buildShipmentCneeBodyLines(shipment, directory);
  const parts = [header];
  if (customerLine) parts.push(customerLine);
  parts.push(dateLine, ...body);
  return parts.join("\n");
}

/** Một dòng ngắn trên lưới — ưu tiên mã viết tắt; tên pháp lý xem trong pop-up. */
export function formatShipmentCneeReadonlySummary(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): string {
  const customer = findCustomerEntry(shipment, directory);
  const saved = resolveSavedConsigneeForBooking(shipment, customer);
  const label = saved?.label?.trim() || "";
  if (label) return label;
  const name = compactSpace(shipment.consigneeNamePrint?.trim() || saved?.consigneeName?.trim() || "");
  if (!name) return "";
  return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}
