/**
 * Pure diff helpers for incremental Postgres persist (no DB I/O).
 */

/** Fingerprint các field ghi vào bảng shipments — bỏ qua noise không persist. */
export function shipmentSqlFingerprint(s) {
  if (!s || typeof s !== "object") return "";
  const invoiceItems = Array.isArray(s.invoiceItems) ? s.invoiceItems : null;
  const invoiceDeclarations = Array.isArray(s.invoiceDeclarations)
    ? s.invoiceDeclarations
    : null;
  return JSON.stringify([
    String(s.id ?? ""),
    Number(s.stt) || 0,
    String(s.sessionDate ?? ""),
    String(s.awb ?? ""),
    String(s.hawb ?? ""),
    String(s.flight ?? ""),
    String(s.flightDate ?? ""),
    String(s.cutoff ?? ""),
    String(s.cutoffNote ?? ""),
    String(s.note ?? ""),
    String(s.dest ?? ""),
    String(s.warehouse ?? ""),
    s.pcs ?? null,
    s.kg ?? null,
    s.dimWeightKg ?? null,
    s.dimLines ?? null,
    s.dimDivisor ?? null,
    String(s.customer ?? ""),
    String(s.customerCode ?? ""),
    String(s.customerId ?? ""),
    String(s.customerShipperId ?? ""),
    String(s.customerConsigneeId ?? ""),
    String(s.customerAgentId ?? ""),
    String(s.globalAgentId ?? ""),
    String(s.customerGoodsId ?? ""),
    String(s.goodsDescriptionPrint ?? ""),
    String(s.otherRequirementsPrint ?? ""),
    String(s.shipperNamePrint ?? ""),
    String(s.shipperAddressPrint ?? ""),
    String(s.shipperPhonePrint ?? ""),
    String(s.shipperEmailPrint ?? ""),
    String(s.taxCodePrint ?? ""),
    String(s.agentNamePrint ?? ""),
    String(s.agentAddressPrint ?? ""),
    String(s.agentPhonePrint ?? ""),
    String(s.agentEmailPrint ?? ""),
    String(s.agentTaxCodePrint ?? ""),
    String(s.consigneeNamePrint ?? ""),
    String(s.consigneeAddressPrint ?? ""),
    String(s.consigneePhonePrint ?? ""),
    String(s.consigneeEmailPrint ?? ""),
    String(s.notifyNamePrint ?? ""),
    String(s.h21DeclarationShipperId ?? ""),
    String(s.status ?? ""),
    invoiceItems,
    invoiceDeclarations,
  ]);
}

/**
 * @param {unknown[]} prevRows
 * @param {unknown[]} nextRows
 * @returns {{ toDelete: string[], toUpsert: object[], unchanged: number }}
 */
export function planShipmentDiff(prevRows, nextRows) {
  const prevList = Array.isArray(prevRows) ? prevRows : [];
  const nextList = Array.isArray(nextRows) ? nextRows : [];
  /** @type {Map<string, object>} */
  const prevById = new Map();
  for (const r of prevList) {
    const id = String(r?.id ?? "").trim();
    if (id) prevById.set(id, r);
  }
  /** @type {Map<string, object>} */
  const nextById = new Map();
  for (const r of nextList) {
    const id = String(r?.id ?? "").trim();
    if (id) nextById.set(id, r);
  }

  const toDelete = [];
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) toDelete.push(id);
  }

  const toUpsert = [];
  let unchanged = 0;
  for (const s of nextList) {
    const id = String(s?.id ?? "").trim();
    if (!id) continue;
    const prev = prevById.get(id);
    if (!prev || shipmentSqlFingerprint(prev) !== shipmentSqlFingerprint(s)) {
      toUpsert.push(s);
    } else {
      unchanged += 1;
    }
  }

  return { toDelete, toUpsert, unchanged };
}

export function customersChanged(prevCustomers, nextCustomers) {
  return JSON.stringify(prevCustomers ?? []) !== JSON.stringify(nextCustomers ?? []);
}

export function airlineOverridesChanged(prev, next) {
  return JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null);
}

/**
 * @param {object | null | undefined} prev
 * @param {object} next
 */
export function planRelationalPersist(prev, next) {
  if (!next || typeof next !== "object") {
    return { mode: "skip" };
  }
  if (!prev || typeof prev !== "object" || !Array.isArray(prev.rows)) {
    return { mode: "full" };
  }
  if (prev.version === next.version && prev === next) {
    return { mode: "skip" };
  }

  const ship = planShipmentDiff(prev.rows, next.rows);
  return {
    mode: "diff",
    shipments: ship,
    replaceCustomers: customersChanged(prev.customers, next.customers),
    replaceAirlineOverrides: airlineOverridesChanged(
      prev.airlineLabelOverrides,
      next.airlineLabelOverrides
    ),
  };
}
