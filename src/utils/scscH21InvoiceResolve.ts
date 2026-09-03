import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { ScscH21StampId } from "../types/scscH21Catalog";
import type { Shipment } from "../types/shipment";
import { findCustomerEntry } from "./customerBookingResolve";
import { buildShipmentCneePartyBlock } from "./shipmentCneeCopyBlock";
import {
  buildH21InvoiceDocument,
  validateH21InvoiceExport,
} from "../../shared/scscH21InvoiceCore.mjs";
import type { H21InvoiceDocument } from "../../shared/scscH21InvoiceCore.d.ts";
import { clampScscH21InvoiceLines } from "../../shared/scscH21CatalogNormalize.mjs";
import type { ScscH21InvoiceLine } from "../types/scscH21Catalog";

export function resolveH21DeclarationShipper(
  shipperId: string | undefined,
  stamps: readonly ScscH21StampId[]
): ScscH21StampId | undefined {
  const id = shipperId?.trim();
  if (!id) return undefined;
  return stamps.find((s) => s.id === id && s.active !== false);
}

export function resolveH21InvoiceCnee(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[]
) {
  const block = buildShipmentCneePartyBlock(shipment, directory);
  const phone =
    block.contactLines
      .find((l) => /^TEL:/i.test(l.trim()))
      ?.replace(/^TEL:\s*/i, "")
      .trim() ?? "";
  const email =
    block.contactLines
      .find((l) => /^EMAIL:/i.test(l.trim()))
      ?.replace(/^EMAIL:\s*/i, "")
      .trim() ?? "";
  return {
    name: block.name,
    addressLines: block.addressLines,
    phone,
    email,
  };
}

export function buildH21InvoiceForShipment(opts: {
  shipment: Shipment;
  directory: readonly CustomerDirectoryEntry[];
  stamps: readonly ScscH21StampId[];
  lines?: ScscH21InvoiceLine[];
  /** Ghi đè shipper đang chọn trong modal (chưa lưu lô). */
  shipperId?: string;
  /** KG phân bổ cho tờ khai này (chia lô). */
  declarationKg?: number | null;
  invoiceSeq?: number;
  invoiceSeqTotal?: number;
}): H21InvoiceDocument {
  const customerEntry = findCustomerEntry(opts.shipment, opts.directory);
  const sid = opts.shipperId ?? opts.shipment.h21DeclarationShipperId;
  const shipper = resolveH21DeclarationShipper(sid, opts.stamps);
  const cnee = resolveH21InvoiceCnee(opts.shipment, opts.directory);
  const lines = clampScscH21InvoiceLines(opts.lines ?? opts.shipment.invoiceItems) as ScscH21InvoiceLine[];
  return buildH21InvoiceDocument({
    shipment: opts.shipment,
    customerEntry,
    shipper,
    cnee,
    lines,
    declarationKg: opts.declarationKg,
    invoiceSeq: opts.invoiceSeq,
    invoiceSeqTotal: opts.invoiceSeqTotal,
  });
}

export function validateH21InvoiceForShipment(opts: {
  shipment: Shipment;
  directory: readonly CustomerDirectoryEntry[];
  stamps: readonly ScscH21StampId[];
  lines?: ScscH21InvoiceLine[];
  shipperId?: string;
}): string[] {
  const customerEntry = findCustomerEntry(opts.shipment, opts.directory);
  const sid = opts.shipperId ?? opts.shipment.h21DeclarationShipperId;
  const shipper = resolveH21DeclarationShipper(sid, opts.stamps);
  const cnee = resolveH21InvoiceCnee(opts.shipment, opts.directory);
  const lines = clampScscH21InvoiceLines(opts.lines ?? opts.shipment.invoiceItems);
  return validateH21InvoiceExport({
    shipment: opts.shipment,
    customerEntry,
    shipper,
    cnee,
    lines,
  });
}
