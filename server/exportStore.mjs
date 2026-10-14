/**
 * Query Postgres trực tiếp cho API export (nhanh hơn /api/state).
 */
import { withDbClient } from "./dbPool.mjs";
import {
  decodeExportCursor,
  encodeExportCursor,
  normalizeExportWarehouse,
  parseExportLimit,
  parseExportView,
  parseSessionDateParam,
  toExportCustomerDto,
  toExportShipmentDto,
} from "./exportContract.mjs";

const SHIPMENTS_TABLE = "shipments";
const CUSTOMERS_TABLE = "customers";
const STATE_META_TABLE = "state_meta";
const DEFAULT_STATE_KEY = "tecsops:state";

function stateKey() {
  return process.env.POSTGRES_STATE_KEY?.trim() || DEFAULT_STATE_KEY;
}

function timestampIsoOrNull(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v.toISOString() : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** @type {boolean | null} */
let shipmentsHasSyncedAt = null;
/** @type {boolean | null} */
let customersHasSyncedAt = null;
let exportIndexesReady = false;

async function tableHasSyncedAt(client, tableName) {
  const res = await client.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = 'synced_at'
    LIMIT 1
    `,
    [tableName],
  );
  return res.rows.length > 0;
}

async function ensureExportIndexes(client) {
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_shipments_session_warehouse
     ON ${SHIPMENTS_TABLE}(session_date, warehouse)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_shipments_awb ON ${SHIPMENTS_TABLE}(awb)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_shipments_status_session
     ON ${SHIPMENTS_TABLE}(session_date, status)`,
  );
}

async function withExportClient(fn) {
  return withDbClient(async (client) => {
    if (!exportIndexesReady) {
      await ensureExportIndexes(client);
      exportIndexesReady = true;
    }
    return fn(client);
  });
}

export async function peekExportStateVersion() {
  return withExportClient(async (client) => {
    const res = await client.query(
      `SELECT version FROM ${STATE_META_TABLE} WHERE id = $1`,
      [stateKey()],
    );
    return Number(res.rows[0]?.version ?? 0);
  });
}

function mapShipmentSqlRow(row) {
  return {
    id: row.id,
    stt: row.stt,
    sessionDate: row.session_date,
    awb: row.awb,
    hawb: row.hawb ?? "",
    flight: row.flight,
    flightDate: row.flight_date,
    cutoff: row.cutoff,
    cutoffNote: row.cutoff_note,
    note: row.note,
    dest: row.dest,
    warehouse: normalizeExportWarehouse(row.warehouse, String(row.warehouse || "")),
    pcs: row.pcs,
    kg: row.kg,
    dimWeightKg: row.dim_weight_kg,
    dimLines: row.dim_lines,
    dimDivisor: row.dim_divisor,
    customer: row.customer,
    customerCode: row.customer_code || "",
    customerId: row.customer_id || "",
    customerShipperId: row.customer_shipper_id || "",
    customerConsigneeId: row.customer_consignee_id || "",
    globalAgentId: row.global_agent_id || row.customer_agent_id || "",
    customerAgentId: row.customer_agent_id || "",
    customerGoodsId: row.customer_goods_id || "",
    goodsDescriptionPrint: row.goods_description_print || "",
    otherRequirementsPrint: row.other_requirements_print || "",
    shipperNamePrint: row.shipper_name_print || "",
    shipperAddressPrint: row.shipper_address_print || "",
    shipperPhonePrint: row.shipper_phone_print || "",
    shipperEmailPrint: row.shipper_email_print || "",
    taxCodePrint: row.tax_code_print || "",
    agentNamePrint: row.agent_name_print || "",
    agentAddressPrint: row.agent_address_print || "",
    agentPhonePrint: row.agent_phone_print || "",
    agentEmailPrint: row.agent_email_print || "",
    agentTaxCodePrint: row.agent_tax_code_print || "",
    consigneeNamePrint: row.consignee_name_print || "",
    consigneeAddressPrint: row.consignee_address_print || "",
    consigneePhonePrint: row.consignee_phone_print || "",
    consigneeEmailPrint: row.consignee_email_print || "",
    notifyNamePrint: row.notify_name_print || "",
    h21DeclarationShipperId: row.h21_declaration_shipper_id || "",
    status: row.status,
    syncedAt: timestampIsoOrNull(row.synced_at),
    invoiceItems: Array.isArray(row.invoice_items) ? row.invoice_items : undefined,
    invoiceDeclarations: Array.isArray(row.invoice_declarations)
      ? row.invoice_declarations
      : undefined,
  };
}

const CORE_SHIPMENT_COLUMNS = `
  id, stt, session_date, awb, hawb, flight, flight_date,
  cutoff, cutoff_note, note, dest, warehouse,
  pcs, kg, dim_weight_kg, dim_lines, dim_divisor,
  customer, customer_code, customer_id, status
`;

const FULL_SHIPMENT_COLUMNS = `
  ${CORE_SHIPMENT_COLUMNS},
  customer_shipper_id, customer_consignee_id, global_agent_id, customer_agent_id,
  customer_goods_id, goods_description_print, other_requirements_print,
  shipper_name_print, shipper_address_print, shipper_phone_print, shipper_email_print,
  tax_code_print, agent_name_print, agent_address_print, agent_phone_print,
  agent_email_print, agent_tax_code_print, consignee_name_print, consignee_address_print,
  consignee_phone_print, consignee_email_print, notify_name_print,
  h21_declaration_shipper_id, invoice_items, invoice_declarations
`;

export async function queryExportShipments(filters = {}) {
  const sessionDate = parseSessionDateParam(filters.sessionDate);
  const warehouse = normalizeExportWarehouse(filters.warehouse, null);
  const status = String(filters.status ?? "").trim().toUpperCase() || null;
  const awb = String(filters.awb ?? "").trim() || null;
  const id = String(filters.id ?? "").trim() || null;
  const view = parseExportView(filters.view);
  const limit = parseExportLimit(filters.limit);
  const cursor =
    filters.cursor && typeof filters.cursor === "object"
      ? filters.cursor
      : decodeExportCursor(filters.cursor);

  if (!sessionDate && !awb && !id) {
    const err = new Error(
      "Cần ít nhất một filter: sessionDate (YYYY-MM-DD), awb, hoặc id.",
    );
    err.statusCode = 400;
    err.code = "EXPORT_FILTER_REQUIRED";
    throw err;
  }
  if (filters.sessionDate && !sessionDate) {
    const err = new Error("sessionDate phải dạng YYYY-MM-DD.");
    err.statusCode = 400;
    err.code = "EXPORT_SESSION_DATE_INVALID";
    throw err;
  }
  if (filters.warehouse && !warehouse) {
    const err = new Error(
      "warehouse không hợp lệ. Cho phép: TECS-TCS, TECS-SCSC, TCS, SCSC.",
    );
    err.statusCode = 400;
    err.code = "EXPORT_WAREHOUSE_INVALID";
    throw err;
  }

  return withExportClient(async (client) => {
    if (shipmentsHasSyncedAt == null) {
      shipmentsHasSyncedAt = await tableHasSyncedAt(client, SHIPMENTS_TABLE);
    }

    const cols = `${view === "full" ? FULL_SHIPMENT_COLUMNS : CORE_SHIPMENT_COLUMNS}${
      shipmentsHasSyncedAt ? ", synced_at" : ""
    }`;

    const where = [];
    const params = [];
    const add = (frag, value) => {
      params.push(value);
      where.push(`${frag} $${params.length}`);
    };

    if (id) add("id =", id);
    if (sessionDate) add("session_date =", sessionDate);
    if (warehouse) add("warehouse =", warehouse);
    if (status) add("status =", status);
    if (awb) {
      const digits = awb.replace(/\D/g, "");
      params.push(awb, digits.length >= 8 ? digits : awb);
      where.push(
        `(awb = $${params.length - 1} OR regexp_replace(awb, '\\D', '', 'g') = $${params.length})`,
      );
    }

    if (cursor?.id) {
      params.push(
        String(cursor.sessionDate || ""),
        String(cursor.warehouse || ""),
        Number(cursor.stt) || 0,
        String(cursor.id),
      );
      const a = params.length - 3;
      const b = params.length - 2;
      const c = params.length - 1;
      const d = params.length;
      where.push(
        `(
          session_date > $${a}
          OR (session_date = $${a} AND warehouse > $${b})
          OR (session_date = $${a} AND warehouse = $${b} AND stt > $${c})
          OR (session_date = $${a} AND warehouse = $${b} AND stt = $${c} AND id > $${d})
        )`,
      );
    }

    params.push(limit + 1);
    const sql = `
      SELECT ${cols}
      FROM ${SHIPMENTS_TABLE}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY session_date ASC, warehouse ASC, stt ASC, id ASC
      LIMIT $${params.length}
    `;

    const res = await client.query(sql, params);
    const rows = res.rows.map(mapShipmentSqlRow);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeExportCursor({
            sessionDate: last.sessionDate,
            warehouse: last.warehouse,
            stt: last.stt,
            id: last.id,
          })
        : null;

    return {
      view,
      query: { sessionDate, warehouse, status, awb, id, limit, view },
      shipments: page.map((r) => toExportShipmentDto(r, view)),
      nextCursor,
    };
  });
}

export async function queryExportShipmentById(id, view = "core") {
  const result = await queryExportShipments({
    id: String(id || "").trim(),
    limit: 1,
    view,
  });
  return result.shipments[0] || null;
}

export async function queryExportCustomers(filters = {}) {
  const q = String(filters.q ?? "").trim();
  const id = String(filters.id ?? "").trim() || null;
  const code = String(filters.code ?? "").trim() || null;
  const limit = parseExportLimit(filters.limit, 200);

  return withExportClient(async (client) => {
    if (customersHasSyncedAt == null) {
      customersHasSyncedAt = await tableHasSyncedAt(client, CUSTOMERS_TABLE);
    }

    const where = [];
    const params = [];
    if (id) {
      params.push(id);
      where.push(`id = $${params.length}`);
    }
    if (code) {
      params.push(code.toUpperCase());
      where.push(`upper(code) = $${params.length}`);
    }
    if (q) {
      const safe = q.replace(/[%_]/g, "");
      params.push(`%${safe}%`);
      where.push(`(code ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }

    params.push(limit);
    const res = await client.query(
      `
      SELECT id, code, name${customersHasSyncedAt ? ", synced_at" : ""}
      FROM ${CUSTOMERS_TABLE}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY code ASC, name ASC, id ASC
      LIMIT $${params.length}
      `,
      params,
    );

    return {
      query: { q: q || null, id, code, limit },
      customers: res.rows.map((row) =>
        toExportCustomerDto({
          id: row.id,
          code: row.code,
          name: row.name,
          syncedAt: timestampIsoOrNull(row.synced_at),
        }),
      ),
    };
  });
}

export function resetExportStoreCachesForTests() {
  shipmentsHasSyncedAt = null;
  customersHasSyncedAt = null;
  exportIndexesReady = false;
}
