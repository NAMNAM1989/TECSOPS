import { randomUUID } from "node:crypto";
import { ensureWeighSlipSchema, WEIGH_SLIPS_TABLE } from "./weighSlipSchema.mjs";
import { mapWeighSlipRowToScaleTicketFormData } from "./weighSlipMapper.mjs";
import { AIRPORTS_TABLE } from "./airportCatalog.mjs";

const STATUSES = new Set(["draft", "final", "archived"]);

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v) {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}

function normalizeAirport(code) {
  const c = str(code).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  return c.length === 3 ? c : null;
}

function rowToApi(row) {
  const snapshot =
    row.print_form_snapshot && typeof row.print_form_snapshot === "object"
      ? row.print_form_snapshot
      : null;
  return {
    id: row.id,
    status: row.status,
    templateName: row.template_name || "",
    customerId: row.customer_id || "",
    customerConsigneeId: row.customer_consignee_id || "",
    legacyShipmentId: row.legacy_shipment_id || "",
    mawbNo: row.mawb_no || "",
    hawbNo: row.hawb_no || "",
    shipperName: row.shipper_name || "",
    shipperAddress: row.shipper_address || "",
    shipperContact: row.shipper_contact || "",
    shipperEmailFax: row.shipper_email_fax || "",
    shipperTaxCode: row.shipper_tax_code || "",
    consigneeName: row.consignee_name || "",
    consigneeAddress: row.consignee_address || "",
    consigneeTaxAccount: row.consignee_tax_account || "",
    notifyAgentName: row.notify_agent_name || "",
    notifyAgentAddress: row.notify_agent_address || "",
    notifyAgentContact: row.notify_agent_contact || "",
    notifyOther: row.notify_other || "",
    destinationAirport: row.destination_airport || "",
    flightNo: row.flight_no || "",
    flightDate: row.flight_date ? String(row.flight_date).slice(0, 10) : "",
    hawbCountStatus: row.hawb_count_status || "",
    goodsDescription: row.goods_description || "",
    hsCode: row.hs_code || "",
    pieces: row.pieces,
    grossWeight: row.gross_weight,
    chargeableWeight: row.chargeable_weight,
    dimensions: row.dimensions || "",
    handlingInstruction: row.handling_instruction || "",
    internalNote: row.internal_note || "",
    printFormSnapshot: snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bodyToColumns(body, { forInsert } = { forInsert: false }) {
  const status = str(body.status).toLowerCase();
  const dest = body.destinationAirport != null ? normalizeAirport(body.destinationAirport) : undefined;
  const cols = {
    template_name: body.templateName != null ? str(body.templateName) : undefined,
    customer_id: body.customerId != null ? str(body.customerId) || null : undefined,
    customer_consignee_id:
      body.customerConsigneeId != null ? str(body.customerConsigneeId) || null : undefined,
    legacy_shipment_id:
      body.legacyShipmentId != null ? str(body.legacyShipmentId) || null : undefined,
    mawb_no: body.mawbNo != null ? str(body.mawbNo) : undefined,
    hawb_no: body.hawbNo != null ? str(body.hawbNo) : undefined,
    shipper_name: body.shipperName != null ? str(body.shipperName) : undefined,
    shipper_address: body.shipperAddress != null ? str(body.shipperAddress) : undefined,
    shipper_contact: body.shipperContact != null ? str(body.shipperContact) : undefined,
    shipper_email_fax: body.shipperEmailFax != null ? str(body.shipperEmailFax) : undefined,
    shipper_tax_code: body.shipperTaxCode != null ? str(body.shipperTaxCode) : undefined,
    consignee_name: body.consigneeName != null ? str(body.consigneeName) : undefined,
    consignee_address: body.consigneeAddress != null ? str(body.consigneeAddress) : undefined,
    consignee_tax_account: body.consigneeTaxAccount != null ? str(body.consigneeTaxAccount) : undefined,
    notify_agent_name: body.notifyAgentName != null ? str(body.notifyAgentName) : undefined,
    notify_agent_address: body.notifyAgentAddress != null ? str(body.notifyAgentAddress) : undefined,
    notify_agent_contact: body.notifyAgentContact != null ? str(body.notifyAgentContact) : undefined,
    notify_other: body.notifyOther != null ? str(body.notifyOther) : undefined,
    destination_airport: dest !== undefined ? dest : undefined,
    flight_no: body.flightNo != null ? str(body.flightNo) : undefined,
    flight_date:
      body.flightDate !== undefined
        ? body.flightDate
          ? str(body.flightDate).slice(0, 10)
          : null
        : undefined,
    hawb_count_status: body.hawbCountStatus != null ? str(body.hawbCountStatus) : undefined,
    goods_description: body.goodsDescription != null ? str(body.goodsDescription) : undefined,
    hs_code: body.hsCode != null ? str(body.hsCode) : undefined,
    pieces: body.pieces !== undefined ? intOrNull(body.pieces) : undefined,
    gross_weight: body.grossWeight !== undefined ? numOrNull(body.grossWeight) : undefined,
    chargeable_weight:
      body.chargeableWeight !== undefined ? numOrNull(body.chargeableWeight) : undefined,
    dimensions: body.dimensions != null ? str(body.dimensions) : undefined,
    handling_instruction:
      body.handlingInstruction != null ? str(body.handlingInstruction) : undefined,
    internal_note: body.internalNote != null ? str(body.internalNote) : undefined,
  };
  if (status && STATUSES.has(status)) cols.status = status;
  if (forInsert) {
    cols.status = cols.status || "draft";
    cols.mawb_no = cols.mawb_no ?? "";
  }
  return cols;
}

async function assertAirportValid(client, iata) {
  if (!iata) return;
  const res = await client.query(`SELECT 1 FROM ${AIRPORTS_TABLE} WHERE iata_code = $1`, [iata]);
  if (res.rows.length === 0) {
    const err = new Error(`Sân bay IATA không hợp lệ: ${iata}`);
    err.statusCode = 400;
    throw err;
  }
}

export async function ensureWeighSlipReady(client) {
  await ensureWeighSlipSchema(client);
}

export async function listWeighSlips(client, { status, q, limit = 50 } = {}) {
  const params = [];
  const where = [];
  if (status && STATUSES.has(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (q) {
    params.push(`%${str(q)}%`);
    const i = params.length;
    where.push(`(mawb_no ILIKE $${i} OR hawb_no ILIKE $${i} OR shipper_name ILIKE $${i})`);
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const sql = `
    SELECT * FROM ${WEIGH_SLIPS_TABLE}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY updated_at DESC
    LIMIT $${params.length}
  `;
  const res = await client.query(sql, params);
  return res.rows.map(rowToApi);
}

export async function getWeighSlipById(client, id) {
  const res = await client.query(`SELECT * FROM ${WEIGH_SLIPS_TABLE} WHERE id = $1`, [id]);
  return res.rows[0] ? rowToApi(res.rows[0]) : null;
}

export async function createWeighSlip(client, body) {
  const id = randomUUID();
  const cols = bodyToColumns(body, { forInsert: true });
  if (cols.destination_airport) await assertAirportValid(client, cols.destination_airport);

  const keys = ["id", ...Object.keys(cols)];
  const vals = [id, ...Object.values(cols)];
  const placeholders = vals.map((_, i) => `$${i + 1}`);
  await client.query(
    `INSERT INTO ${WEIGH_SLIPS_TABLE} (${keys.join(", ")}) VALUES (${placeholders.join(", ")})`,
    vals
  );

  if (cols.status === "final") {
    await finalizeWeighSlip(client, id, body.printFormSnapshot);
  }
  return getWeighSlipById(client, id);
}

export async function updateWeighSlip(client, id, body) {
  const existing = await client.query(`SELECT * FROM ${WEIGH_SLIPS_TABLE} WHERE id = $1`, [id]);
  if (!existing.rows[0]) return null;

  const cols = bodyToColumns(body);
  if (cols.destination_airport) await assertAirportValid(client, cols.destination_airport);

  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (entries.length === 0 && body.status !== "final") {
    return getWeighSlipById(client, id);
  }

  if (entries.length > 0) {
    const sets = entries.map(([k], i) => `${k} = $${i + 2}`);
    const vals = entries.map(([, v]) => v);
    await client.query(
      `UPDATE ${WEIGH_SLIPS_TABLE} SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`,
      [id, ...vals]
    );
  }

  const nextStatus = str(body.status).toLowerCase();
  if (nextStatus === "final") {
    await finalizeWeighSlip(client, id, body.printFormSnapshot);
  }

  return getWeighSlipById(client, id);
}

async function finalizeWeighSlip(client, id, clientSnapshot) {
  const res = await client.query(`SELECT * FROM ${WEIGH_SLIPS_TABLE} WHERE id = $1`, [id]);
  const row = res.rows[0];
  if (!row) return;
  const snapshot =
    clientSnapshot && typeof clientSnapshot === "object"
      ? clientSnapshot
      : mapWeighSlipRowToScaleTicketFormData(row);
  await client.query(
    `UPDATE ${WEIGH_SLIPS_TABLE} SET status = 'final', print_form_snapshot = $2::jsonb, updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(snapshot)]
  );
}

export async function duplicateWeighSlip(client, id) {
  const res = await client.query(`SELECT * FROM ${WEIGH_SLIPS_TABLE} WHERE id = $1`, [id]);
  if (!res.rows[0]) return null;
  const src = res.rows[0];
  const newId = randomUUID();
  await client.query(
    `
    INSERT INTO ${WEIGH_SLIPS_TABLE} (
      id, status, template_name, customer_id, customer_consignee_id, legacy_shipment_id,
      mawb_no, hawb_no, shipper_name, shipper_address, shipper_contact, shipper_email_fax, shipper_tax_code,
      consignee_name, consignee_address, consignee_tax_account,
      notify_agent_name, notify_agent_address, notify_agent_contact, notify_other,
      destination_airport, flight_no, flight_date, hawb_count_status,
      goods_description, hs_code, pieces, gross_weight, chargeable_weight,
      dimensions, handling_instruction, internal_note, print_form_snapshot
    )
    SELECT
      $2, 'draft', template_name, customer_id, customer_consignee_id, legacy_shipment_id,
      mawb_no, hawb_no, shipper_name, shipper_address, shipper_contact, shipper_email_fax, shipper_tax_code,
      consignee_name, consignee_address, consignee_tax_account,
      notify_agent_name, notify_agent_address, notify_agent_contact, notify_other,
      destination_airport, flight_no, flight_date, hawb_count_status,
      goods_description, hs_code, pieces, gross_weight, chargeable_weight,
      dimensions, handling_instruction, internal_note, NULL
    FROM ${WEIGH_SLIPS_TABLE} WHERE id = $1
    `,
    [id, newId]
  );
  return getWeighSlipById(client, newId);
}

export async function lookupAirports(client, q, limit = 30) {
  const term = str(q).toUpperCase();
  if (!term) {
    const res = await client.query(
      `SELECT iata_code, name, country FROM ${AIRPORTS_TABLE} ORDER BY iata_code LIMIT $1`,
      [Math.min(limit, 100)]
    );
    return res.rows;
  }
  const res = await client.query(
    `
    SELECT iata_code, name, country FROM ${AIRPORTS_TABLE}
    WHERE iata_code ILIKE $1 OR name ILIKE $2
    ORDER BY iata_code
    LIMIT $3
    `,
    [`${term}%`, `%${term}%`, Math.min(limit, 100)]
  );
  return res.rows;
}

export async function lookupCustomers(client, q, limit = 40) {
  const term = str(q);
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const params = [lim];
  let where = "";
  if (term) {
    params.unshift(`%${term}%`);
    where = `WHERE c.code ILIKE $1 OR c.name ILIKE $1 OR c.id ILIKE $1`;
    params[0] = params[0];
    params.unshift(`%${term}%`);
    // fix param indices
  }
  const sql = term
    ? `
    SELECT c.id, c.code, c.name,
           p.shipper_name, p.shipper_address, p.shipper_phone, p.shipper_email, p.shipper_vat_code,
           p.agent_name, p.agent_address, p.agent_phone, p.agent_email, p.agent_vat_code,
           p.consignee_name, p.consignee_address, p.consignee_phone, p.consignee_email, p.notify_name
    FROM customers c
    LEFT JOIN customer_print_profiles p ON p.customer_id = c.id
    WHERE c.code ILIKE $1 OR c.name ILIKE $1
    ORDER BY c.code ASC
    LIMIT $2
    `
    : `
    SELECT c.id, c.code, c.name,
           p.shipper_name, p.shipper_address, p.shipper_phone, p.shipper_email, p.shipper_vat_code,
           p.agent_name, p.agent_address, p.agent_phone, p.agent_email, p.agent_vat_code,
           p.consignee_name, p.consignee_address, p.consignee_phone, p.consignee_email, p.notify_name
    FROM customers c
    LEFT JOIN customer_print_profiles p ON p.customer_id = c.id
    ORDER BY c.code ASC
    LIMIT $1
    `;
  const res = await client.query(sql, term ? [`%${term}%`, lim] : [lim]);
  return res.rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    shipperName: r.shipper_name || "",
    shipperAddress: r.shipper_address || "",
    shipperPhone: r.shipper_phone || "",
    shipperEmail: r.shipper_email || "",
    taxCode: r.shipper_vat_code || "",
    agentName: r.agent_name || "",
    agentAddress: r.agent_address || "",
    agentPhone: r.agent_phone || "",
    agentEmail: r.agent_email || "",
    agentTaxCode: r.agent_vat_code || "",
    consigneeName: r.consignee_name || "",
    consigneeAddress: r.consignee_address || "",
    consigneePhone: r.consignee_phone || "",
    consigneeEmail: r.consignee_email || "",
    notifyName: r.notify_name || "",
  }));
}

export async function lookupCustomerConsignees(client, customerId) {
  const res = await client.query(
    `SELECT * FROM customer_consignees WHERE customer_id = $1 ORDER BY sort_order ASC, id ASC`,
    [customerId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    label: r.label || "",
    consigneeName: r.consignee_name || "",
    consigneeAddress: r.consignee_address || "",
    consigneePhone: r.consignee_phone || "",
    consigneeEmail: r.consignee_email || "",
    notifyName: r.notify_name || "",
  }));
}
