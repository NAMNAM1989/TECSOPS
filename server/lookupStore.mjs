import { AIRPORTS_TABLE, ensureAirportSchema, seedAirportsIfEmpty } from "./airportCatalog.mjs";

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

export async function ensureLookupReady(client) {
  await ensureAirportSchema(client);
  await seedAirportsIfEmpty(client);
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

export async function lookupCustomerAgents(client, customerId) {
  const res = await client.query(
    `SELECT * FROM customer_agents WHERE customer_id = $1 ORDER BY sort_order ASC, id ASC`,
    [customerId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    label: r.label || "",
    agentName: r.agent_name || "",
    agentAddress: r.agent_address || "",
    agentPhone: r.agent_phone || "",
    agentEmail: r.agent_email || "",
    agentTaxCode: r.agent_tax_code || "",
  }));
}
