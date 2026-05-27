const INVOICE_EXPORT_PAYLOAD_VERSION = 1;

export function validateInvoicePayload(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Payload không hợp lệ."] };
  }
  if (raw.version !== INVOICE_EXPORT_PAYLOAD_VERSION) {
    errors.push(`version phải là ${INVOICE_EXPORT_PAYLOAD_VERSION}.`);
  }
  if (!raw.meta?.invoiceNo?.trim()) errors.push("Thiếu meta.invoiceNo.");
  if (!Array.isArray(raw.lines)) errors.push("Thiếu lines.");
  return { ok: errors.length === 0, errors };
}

/** Map export payload → PDFKit legacy shape. */
export function exportPayloadToPdfKit(payload) {
  return {
    invoiceNo: payload.meta?.invoiceNo ?? "",
    dateStr: payload.meta?.dateStr ?? "",
    flight: payload.meta?.flightLine ?? "",
    cneeLines: payload.cnee?.lines ?? [],
    items: (payload.lines ?? []).map((l) => ({
      description: l.description,
      hsCode: l.hsCode,
      origin: l.origin,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceUsd: l.unitPriceUsd,
      kgPerUnit: l.kgPerUnit,
    })),
    pcs: payload.footer?.cartons ?? null,
    kg: payload.footer?.grossKg ?? null,
    awb: payload.meta?.awb ?? "",
  };
}
