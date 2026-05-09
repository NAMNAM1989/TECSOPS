import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { buildScscDimListModel } from "./scscDimListReport";

export type ScaleTicketFormData = {
  awb: string;
  flightNo: string;
  flightDate: string;
  destination: string;
  origin: string;
  totalPieces: string;
  grossWeight: string;
  chargeableWeight: string;
  customerCode: string;
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
  note: string;
  /** Một ô in: chuyến / ngày */
  flightLinePrint: string;
  dimensionsText: string;
  goodsDescription: string;
  /** Số nhóm HAWB hoặc nhãn "No Hawb" khi không có */
  hawbDisplay: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function compactSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function findCustomerEntry(
  booking: Shipment,
  directory: readonly CustomerDirectoryEntry[]
): CustomerDirectoryEntry | undefined {
  const customerIdRaw = booking.customerId?.trim();
  const codeRaw = booking.customerCode?.trim();
  const nameRaw = booking.customer?.trim();
  if (customerIdRaw) {
    const byId = directory.find((e) => norm(e.id) === norm(customerIdRaw));
    if (byId) return byId;
  }
  if (codeRaw) {
    const byCode = directory.find((e) => norm(e.code) === norm(codeRaw));
    if (byCode) return byCode;
  }
  if (nameRaw) {
    const byName = directory.find((e) => norm(e.name) === norm(nameRaw));
    if (byName) return byName;
    const nameAsCode = directory.find((e) => norm(e.code) === norm(nameRaw));
    if (nameAsCode) return nameAsCode;
  }
  return undefined;
}

function extractContactFromParties(entry: CustomerDirectoryEntry): {
  address: string;
  phone: string;
  taxCode: string;
} {
  if (entry.shipperAddress?.trim() || entry.shipperPhone?.trim() || entry.taxCode?.trim()) {
    return {
      address: compactSpace(entry.shipperAddress ?? "").slice(0, 500),
      phone: compactSpace(entry.shipperPhone ?? "").slice(0, 32),
      taxCode: compactSpace(entry.taxCode ?? ""),
    };
  }
  const partiesText = entry.parties.map((p) => p.content).join("\n");
  const shipperParty = entry.parties.find((p) => p.type === "SHIPPER");
  let address = "";
  if (shipperParty?.content?.trim()) {
    address = compactSpace(shipperParty.content);
  }
  const phoneMatch =
    partiesText.match(/(?:SĐT|SDT|ĐT|DT|TEL|PHONE|Tel)[:\s]*([+\d\s().-]{8,})/i) ||
    partiesText.match(/\b0\d{9,10}\b/) ||
    partiesText.match(/\+?\d[\d\s().-]{8,}\d/);
  const phoneRaw = phoneMatch?.[1] ?? phoneMatch?.[0] ?? "";
  const phone = compactSpace(phoneRaw).slice(0, 32);
  const taxMatch = partiesText.match(/(?:MST|TAX|Tax\s*code)[:\s]*([0-9A-Z.\-]{6,24})/i);
  const taxCode = taxMatch?.[1]?.trim() ?? "";
  return { address: address.slice(0, 500), phone, taxCode };
}

/**
 * Map một dòng booking (Shipment) sang dữ liệu phiếu cân SCSC.
 * `customers`: danh bạ tùy chọn — nếu khớp mã/tên thì bổ sung tên đầy đủ / địa chỉ / SĐT / MST từ parties.
 */
export function mapBookingToScaleTicketFormData(
  booking: Shipment,
  customers: readonly CustomerDirectoryEntry[] = []
): ScaleTicketFormData {
  const dimModel = buildScscDimListModel(booking);
  const gw = booking.kg ?? 0;
  const vw = booking.dimWeightKg ?? 0;
  const cw = Math.max(gw, vw);

  const totalPiecesNum = booking.pcs ?? dimModel?.totalPcs ?? null;

  const dimensionsText = dimModel?.rows.length
    ? dimModel.rows
        .slice(0, 6)
        .map((line, idx) => `${idx + 1}. ${line.lCm.toFixed(0)} x ${line.wCm.toFixed(0)} x ${line.hCm.toFixed(0)} x ${line.pcs}`)
        .join("\n")
    : "";

  const noteTrim = booking.note?.trim() ?? "";
  const goodsDescription = noteTrim ? noteTrim.slice(0, 60) : "GENERAL CARGO";

  const customer = findCustomerEntry(booking, customers);
  const partyContact = customer ? extractContactFromParties(customer) : { address: "", phone: "", taxCode: "" };

  const customerCode = booking.customerCode?.trim() || booking.customer?.trim() || "";

  const shipperNamePrintTrim = booking.shipperNamePrint?.trim() || "";
  const printLooksLikeShortCode =
    shipperNamePrintTrim &&
    (norm(shipperNamePrintTrim) === norm(booking.customer) ||
      norm(shipperNamePrintTrim) === norm(booking.customerCode || ""));

  const profileShipperName = customer?.shipperName?.trim() || "";
  const shipperNameFallback =
    customer?.shipperName?.trim() || customer?.name?.trim() || booking.customer?.trim() || "";
  const shipperAddressFallback = customer ? partyContact.address : "";
  const shipperPhoneFallback = customer ? partyContact.phone : "";
  const taxCodeFallback = customer ? partyContact.taxCode : "";
  const shipperEmailFallback = customer?.shipperEmail?.trim() || "";
  const agentNameFallback = customer?.agentName?.trim() || "";
  const agentAddressFallback = customer?.agentAddress?.trim() || "";
  const agentPhoneFallback = customer?.agentPhone?.trim() || "";
  const agentEmailFallback = customer?.agentEmail?.trim() || "";
  const agentTaxCodeFallback = customer?.agentTaxCode?.trim() || "";
  const consigneeNameFallback = customer?.consigneeName?.trim() || "";
  const consigneeAddressFallback = customer?.consigneeAddress?.trim() || "";
  const consigneePhoneFallback = customer?.consigneePhone?.trim() || "";
  const consigneeEmailFallback = customer?.consigneeEmail?.trim() || "";
  const notifyNameFallback = customer?.notifyName?.trim() || noteTrim;

  /** Dòng tên shipper: nếu booking chỉ lưu mã/ngắn trùng cột khách thì ưu tiên tên đầy đủ trong hồ sơ (shipperName hoặc name) */
  const shipperName = compactSpace(
    printLooksLikeShortCode
      ? profileShipperName || customer?.name?.trim() || shipperNamePrintTrim || booking.customer?.trim() || ""
      : shipperNamePrintTrim || profileShipperName || shipperNameFallback
  ).slice(0, 120);
  const shipperAddress = compactSpace(booking.shipperAddressPrint?.trim() || shipperAddressFallback).slice(0, 110);
  const shipperPhone = compactSpace(booking.shipperPhonePrint?.trim() || shipperPhoneFallback).slice(0, 24);
  const taxCode = compactSpace(booking.taxCodePrint?.trim() || taxCodeFallback).slice(0, 24);

  return {
    awb: booking.awb?.trim() || "",
    flightNo: booking.flight?.trim() || "",
    flightDate: booking.flightDate?.trim() || "",
    destination: booking.dest?.trim() || "",
    origin: "SGN",
    totalPieces:
      totalPiecesNum != null && totalPiecesNum > 0 ? String(totalPiecesNum) : "",
    grossWeight:
      booking.kg != null && booking.kg > 0 ? gw.toFixed(1) : "",
    chargeableWeight:
      booking.kg != null && booking.kg > 0 && cw > 0 ? cw.toFixed(1) : "",
    customerCode,
    shipperName,
    shipperAddress,
    shipperPhone,
    shipperEmail: compactSpace(booking.shipperEmailPrint?.trim() || shipperEmailFallback).slice(0, 50),
    taxCode,
    agentName: compactSpace(booking.agentNamePrint?.trim() || agentNameFallback).slice(0, 45),
    agentAddress: compactSpace(booking.agentAddressPrint?.trim() || agentAddressFallback).slice(0, 110),
    agentPhone: compactSpace(booking.agentPhonePrint?.trim() || agentPhoneFallback).slice(0, 24),
    agentEmail: compactSpace(booking.agentEmailPrint?.trim() || agentEmailFallback).slice(0, 50),
    agentTaxCode: compactSpace(booking.agentTaxCodePrint?.trim() || agentTaxCodeFallback).slice(0, 24),
    consigneeName: compactSpace(booking.consigneeNamePrint?.trim() || consigneeNameFallback).slice(0, 45),
    consigneeAddress: compactSpace(booking.consigneeAddressPrint?.trim() || consigneeAddressFallback).slice(0, 110),
    consigneePhone: compactSpace(booking.consigneePhonePrint?.trim() || consigneePhoneFallback).slice(0, 24),
    consigneeEmail: compactSpace(booking.consigneeEmailPrint?.trim() || consigneeEmailFallback).slice(0, 50),
    notifyName: compactSpace(booking.notifyNamePrint?.trim() || notifyNameFallback).slice(0, 80),
    note: noteTrim,
    flightLinePrint: (() => {
      const f = booking.flight?.trim() || "";
      const d = booking.flightDate?.trim() || "";
      if (f && d) return `${f} / ${d}`;
      return f || d;
    })(),
    dimensionsText,
    goodsDescription,
    hawbDisplay:
      dimModel && dimModel.rows.length > 0 ? String(dimModel.rows.length) : "No Hawb",
  };
}
