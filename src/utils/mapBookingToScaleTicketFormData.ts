import type { Shipment } from "../types/shipment";
import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
} from "../types/customerDirectory";
import type { GlobalAgentCatalog, GlobalAgentEntry } from "../types/globalAgents";
import { lookupCustomerEntryByName } from "./customerDirectoryCore";
import { findGlobalAgentById } from "./globalAgentsCore";
import { buildScscDimListModel } from "./scscDimListReport";
import { resolvePrintAddressForShipment } from "./printAddressMultiline";

export type ScaleTicketFormData = {
  awb: string;
  flightNo: string;
  flightDate: string;
  destination: string;
  /** Không in trên phiếu (mẫu giấy đã có SGN) — giữ cho tương thích type. */
  origin?: string;
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
  /** Số HAWB in dưới AWB (góc phải). */
  hawb: string;
  /** Số nhóm HAWB hoặc nhãn "No Hawb" khi không có (ô TOTAL HAWB trên form). */
  hawbDisplay: string;
  /** Yêu cầu khác — từ hồ sơ khách. */
  otherRequirements: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function compactSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function findCustomerEntry(
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
    const byLookup = lookupCustomerEntryByName(directory, nameRaw);
    if (byLookup) return byLookup;
    const byName = directory.find((e) => norm(e.name) === norm(nameRaw));
    if (byName) return byName;
    const nameAsCode = directory.find((e) => norm(e.code) === norm(nameRaw));
    if (nameAsCode) return nameAsCode;
  }
  return undefined;
}

/** Shipper lưu sẵn: theo `customerShipperId`, hoặc tự động một mục nếu danh bạ chỉ có một. */
export function resolveSavedShipperForBooking(
  booking: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  opts?: { skipAutoSingleShipper?: boolean }
): CustomerSavedShipper | undefined {
  const list = customer?.savedShippers ?? [];
  if (!list.length) return undefined;
  const id = booking.customerShipperId?.trim();
  if (id) return list.find((x) => norm(x.id) === norm(id));
  if (opts?.skipAutoSingleShipper) return undefined;
  const defId = customer?.defaultShipperId?.trim();
  if (defId) {
    const d = list.find((x) => norm(x.id) === norm(defId));
    if (d) return d;
  }
  if (list.length === 1) return list[0];
  return undefined;
}

/** CNEE lưu sẵn: theo `customerConsigneeId`, hoặc tự động một mục nếu danh bạ chỉ có một (trừ khi `skipAutoSingleConsignee`). */
export function resolveSavedConsigneeForBooking(
  booking: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  opts?: { skipAutoSingleConsignee?: boolean }
): CustomerSavedConsignee | undefined {
  const list = customer?.savedConsignees ?? [];
  if (!list.length) return undefined;
  const id = booking.customerConsigneeId?.trim();
  if (id) return list.find((x) => norm(x.id) === norm(id));
  if (opts?.skipAutoSingleConsignee) return undefined;
  const defId = customer?.defaultConsigneeId?.trim();
  if (defId) {
    const d = list.find((x) => norm(x.id) === norm(defId));
    if (d) return d;
  }
  if (list.length === 1) return list[0];
  return undefined;
}

function bookingGlobalAgentId(booking: Shipment): string {
  return (booking.globalAgentId ?? booking.customerAgentId ?? "").trim();
}

/** Agent chung: theo `globalAgentId` trên lô, hoặc mặc định toàn hệ thống. */
export function resolveGlobalAgentForBooking(
  booking: Shipment,
  catalog: GlobalAgentCatalog,
  opts?: { skipAutoDefault?: boolean }
): GlobalAgentEntry | undefined {
  const list = catalog.agents.filter((x) => x.id.trim());
  if (!list.length) return undefined;
  const explicit = bookingGlobalAgentId(booking);
  if (explicit) return findGlobalAgentById(catalog, explicit);
  if (opts?.skipAutoDefault) return undefined;
  return findGlobalAgentById(catalog, catalog.defaultAgentId);
}

/** Tên hàng lưu sẵn theo khách. */
export function resolveSavedGoodsForBooking(
  booking: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  opts?: { skipAutoSingleGoods?: boolean }
): CustomerSavedGoods | undefined {
  const list = customer?.savedGoods ?? [];
  if (!list.length) return undefined;
  const id = booking.customerGoodsId?.trim();
  if (id) return list.find((x) => norm(x.id) === norm(id));
  if (opts?.skipAutoSingleGoods) return undefined;
  const defId = customer?.defaultGoodsId?.trim();
  if (defId) {
    const d = list.find((x) => norm(x.id) === norm(defId));
    if (d) return d;
  }
  if (list.length === 1) return list[0];
  return undefined;
}

/**
 * Map một dòng booking (Shipment) sang dữ liệu phiếu cân SCSC.
 * `customers`: danh bạ tùy chọn — bổ sung shipper/CNEE/agent/tên hàng từ preset lưu sẵn.
 */
export function mapBookingToScaleTicketFormData(
  booking: Shipment,
  customers: readonly CustomerDirectoryEntry[] = [],
  mapOpts?: {
    skipAutoSingleConsignee?: boolean;
    skipAutoDefaultAgent?: boolean;
    skipAutoSingleGoods?: boolean;
    skipAutoSingleShipper?: boolean;
    globalAgents?: GlobalAgentCatalog;
  }
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

  const customer = findCustomerEntry(booking, customers);
  const savedShipper = resolveSavedShipperForBooking(booking, customer, {
    skipAutoSingleShipper: mapOpts?.skipAutoSingleShipper,
  });
  const savedCnee = resolveSavedConsigneeForBooking(booking, customer, {
    skipAutoSingleConsignee: mapOpts?.skipAutoSingleConsignee,
  });
  const catalog = mapOpts?.globalAgents;
  const savedAgent = catalog
    ? resolveGlobalAgentForBooking(booking, catalog, {
        skipAutoDefault: mapOpts?.skipAutoDefaultAgent,
      })
    : undefined;
  const savedGoods = resolveSavedGoodsForBooking(booking, customer, {
    skipAutoSingleGoods: mapOpts?.skipAutoSingleGoods,
  });
  const goodsPrintTrim = booking.goodsDescriptionPrint?.trim() ?? "";
  const goodsDescription = compactSpace(
    goodsPrintTrim ||
      savedGoods?.goodsDescription?.trim() ||
      (noteTrim ? noteTrim.slice(0, 60) : "")
  ).slice(0, 60) || "GENERAL CARGO";
  const customerCode = booking.customerCode?.trim() || booking.customer?.trim() || "";

  const shipperNamePrintTrim = booking.shipperNamePrint?.trim() || "";
  const looksLikeAccountLabel =
    shipperNamePrintTrim &&
    (norm(shipperNamePrintTrim) === norm(booking.customer) ||
      norm(shipperNamePrintTrim) === norm(booking.customerCode || ""));

  const presetShipperName = savedShipper?.shipperName?.trim() || "";
  const shipperAddressFallback = savedShipper?.shipperAddress ?? "";
  const shipperPhoneFallback = savedShipper?.shipperPhone?.trim() || "";
  const taxCodeFallback = savedShipper?.taxCode?.trim() || "";
  const shipperEmailFallback = savedShipper?.shipperEmail?.trim() || "";
  const agentIsNone = Boolean(savedAgent?.isNone);
  const agentNameFallback = agentIsNone ? "" : savedAgent?.agentName?.trim() || "";
  const agentAddressFallback = agentIsNone ? "" : savedAgent?.agentAddress ?? "";
  const agentPhoneFallback = agentIsNone ? "" : savedAgent?.agentPhone?.trim() || "";
  const agentEmailFallback = agentIsNone ? "" : savedAgent?.agentEmail?.trim() || "";
  const agentTaxCodeFallback = agentIsNone ? "" : savedAgent?.agentTaxCode?.trim() || "";
  const consigneeNameFallback = savedCnee?.consigneeName?.trim() || "";
  const consigneeAddressFallback = savedCnee?.consigneeAddress ?? "";
  const consigneePhoneFallback = savedCnee?.consigneePhone?.trim() || "";
  const consigneeEmailFallback = savedCnee?.consigneeEmail?.trim() || "";
  const notifyNameFallback = savedCnee?.notifyName?.trim() || noteTrim;

  /** Snapshot in trên lô → preset lưu sẵn; không gán tên account khách làm shipper. */
  const shipperName = compactSpace(
    looksLikeAccountLabel
      ? presetShipperName || shipperNamePrintTrim
      : shipperNamePrintTrim || presetShipperName
  ).slice(0, 120);
  const shipperAddress = resolvePrintAddressForShipment({
    bookingPrint: booking.shipperAddressPrint,
    directoryPrint: shipperAddressFallback,
    maxLines: 2,
  });
  const shipperPhone = compactSpace(booking.shipperPhonePrint?.trim() || shipperPhoneFallback).slice(0, 24);
  const taxCode = compactSpace(booking.taxCodePrint?.trim() || taxCodeFallback).slice(0, 24);

  return {
    awb: booking.awb?.trim() || "",
    flightNo: booking.flight?.trim() || "",
    flightDate: booking.flightDate?.trim() || "",
    destination: booking.dest?.trim() || "",
    origin: "",
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
    agentAddress: resolvePrintAddressForShipment({
      bookingPrint: booking.agentAddressPrint,
      directoryPrint: agentAddressFallback,
    }),
    agentPhone: compactSpace(booking.agentPhonePrint?.trim() || agentPhoneFallback).slice(0, 24),
    agentEmail: compactSpace(booking.agentEmailPrint?.trim() || agentEmailFallback).slice(0, 50),
    agentTaxCode: compactSpace(booking.agentTaxCodePrint?.trim() || agentTaxCodeFallback).slice(0, 24),
    consigneeName: compactSpace(booking.consigneeNamePrint?.trim() || consigneeNameFallback).slice(0, 45),
    consigneeAddress: resolvePrintAddressForShipment({
      bookingPrint: booking.consigneeAddressPrint,
      directoryPrint: consigneeAddressFallback,
    }),
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
    hawb: (booking.hawb?.trim() ?? "").slice(0, 48),
    hawbDisplay: (() => {
      const h = booking.hawb?.trim() ?? "";
      return h ? "01 HAWB" : "NO HAWB";
    })(),
    otherRequirements: compactSpace(customer?.otherRequirementsPrint ?? "").slice(
      0,
      200
    ),
  };
}
