import pg from "pg";
import { normalizeAirlineLabelOverridesLoose } from "./airlineLabelOverridesNormalize.mjs";
import { normalizePrinterProfilesCatalogLoose } from "./printerProfilesNormalize.mjs";
import { normalizeGlobalAgentsLoose } from "./globalAgentsNormalize.mjs";
import { normalizeScscWeighPrintSettingsLoose } from "./scscWeighPrintSettingsNormalize.mjs";
import {
  ensureAirlineCatalogSchema,
  loadAirlineDisplayOverrides,
  migrateAirlineOverridesFromBlob,
  saveAirlineDisplayOverrides,
  seedAirlineCatalogIfEmpty,
} from "./airlineCatalog.mjs";
import { ensureAirportSchema, seedAirportsIfEmpty } from "./airportCatalog.mjs";
import { ensureWeighSlipSchema } from "./weighSlipSchema.mjs";

const { Pool } = pg;

const DEFAULT_STATE_KEY = "tecsops:state";
const TABLE_NAME = "app_state";
const CUSTOMERS_TABLE = "customers";
const CUSTOMER_PROFILES_TABLE = "customer_print_profiles";
const CUSTOMER_CONSIGNEES_TABLE = "customer_consignees";
const CUSTOMER_SHIPPERS_TABLE = "customer_shippers";
const CUSTOMER_AGENTS_TABLE = "customer_agents";
const CUSTOMER_PARTIES_TABLE = "customer_parties";
const SHIPMENTS_TABLE = "shipments";
const STATE_META_TABLE = "state_meta";

function stateKey() {
  return process.env.POSTGRES_STATE_KEY || process.env.REDIS_STATE_KEY || DEFAULT_STATE_KEY;
}

function makePool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.internal") ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id text PRIMARY KEY,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${STATE_META_TABLE} (
      id text PRIMARY KEY,
      version bigint NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMERS_TABLE} (
      id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMER_PROFILES_TABLE} (
      customer_id text PRIMARY KEY REFERENCES ${CUSTOMERS_TABLE}(id) ON DELETE CASCADE,
      shipper_name text NOT NULL DEFAULT '',
      shipper_address text NOT NULL DEFAULT '',
      shipper_phone text NOT NULL DEFAULT '',
      shipper_email text NOT NULL DEFAULT '',
      shipper_vat_code text NOT NULL DEFAULT '',
      agent_name text NOT NULL DEFAULT '',
      agent_address text NOT NULL DEFAULT '',
      agent_phone text NOT NULL DEFAULT '',
      agent_email text NOT NULL DEFAULT '',
      agent_vat_code text NOT NULL DEFAULT '',
      consignee_name text NOT NULL DEFAULT '',
      consignee_address text NOT NULL DEFAULT '',
      consignee_phone text NOT NULL DEFAULT '',
      consignee_email text NOT NULL DEFAULT '',
      notify_name text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${SHIPMENTS_TABLE} (
      id text PRIMARY KEY,
      stt integer NOT NULL,
      session_date text NOT NULL,
      awb text NOT NULL,
      hawb text NOT NULL DEFAULT '',
      flight text NOT NULL,
      flight_date text NOT NULL,
      cutoff text NOT NULL,
      cutoff_note text NOT NULL,
      note text NOT NULL,
      dest text NOT NULL,
      warehouse text NOT NULL,
      pcs integer NULL,
      kg double precision NULL,
      dim_weight_kg double precision NULL,
      dim_lines jsonb NULL,
      dim_divisor integer NULL,
      customer text NOT NULL,
      customer_code text NOT NULL DEFAULT '',
      customer_id text NULL REFERENCES ${CUSTOMERS_TABLE}(id) ON DELETE SET NULL,
      shipper_name_print text NOT NULL DEFAULT '',
      shipper_address_print text NOT NULL DEFAULT '',
      shipper_phone_print text NOT NULL DEFAULT '',
      shipper_email_print text NOT NULL DEFAULT '',
      tax_code_print text NOT NULL DEFAULT '',
      agent_name_print text NOT NULL DEFAULT '',
      agent_address_print text NOT NULL DEFAULT '',
      agent_phone_print text NOT NULL DEFAULT '',
      agent_email_print text NOT NULL DEFAULT '',
      agent_tax_code_print text NOT NULL DEFAULT '',
      consignee_name_print text NOT NULL DEFAULT '',
      consignee_address_print text NOT NULL DEFAULT '',
      consignee_phone_print text NOT NULL DEFAULT '',
      consignee_email_print text NOT NULL DEFAULT '',
      notify_name_print text NOT NULL DEFAULT '',
      status text NOT NULL
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_shipments_session_date ON ${SHIPMENTS_TABLE}(session_date)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON ${SHIPMENTS_TABLE}(customer_id)`);
  await client.query(
    `ALTER TABLE ${SHIPMENTS_TABLE} ADD COLUMN IF NOT EXISTS hawb text NOT NULL DEFAULT ''`
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMER_CONSIGNEES_TABLE} (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES ${CUSTOMERS_TABLE}(id) ON DELETE CASCADE,
      label text NOT NULL DEFAULT '',
      consignee_name text NOT NULL DEFAULT '',
      consignee_address text NOT NULL DEFAULT '',
      consignee_phone text NOT NULL DEFAULT '',
      consignee_email text NOT NULL DEFAULT '',
      notify_name text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_customer_consignees_customer ON ${CUSTOMER_CONSIGNEES_TABLE}(customer_id)`
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMER_SHIPPERS_TABLE} (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES ${CUSTOMERS_TABLE}(id) ON DELETE CASCADE,
      label text NOT NULL DEFAULT '',
      shipper_name text NOT NULL DEFAULT '',
      shipper_address text NOT NULL DEFAULT '',
      shipper_phone text NOT NULL DEFAULT '',
      shipper_email text NOT NULL DEFAULT '',
      shipper_vat_code text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_customer_shippers_customer ON ${CUSTOMER_SHIPPERS_TABLE}(customer_id)`
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMER_PARTIES_TABLE} (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES ${CUSTOMERS_TABLE}(id) ON DELETE CASCADE,
      party_type text NOT NULL DEFAULT 'OTHER',
      label text NOT NULL DEFAULT '',
      content text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_customer_parties_customer ON ${CUSTOMER_PARTIES_TABLE}(customer_id)`
  );
  await client.query(`
    ALTER TABLE ${SHIPMENTS_TABLE}
    ADD COLUMN IF NOT EXISTS customer_consignee_id text REFERENCES ${CUSTOMER_CONSIGNEES_TABLE}(id) ON DELETE SET NULL
  `);
  await client.query(`
    ALTER TABLE ${SHIPMENTS_TABLE}
    ADD COLUMN IF NOT EXISTS customer_shipper_id text REFERENCES ${CUSTOMER_SHIPPERS_TABLE}(id) ON DELETE SET NULL
  `);
  await client.query(`
    ALTER TABLE ${SHIPMENTS_TABLE}
    ADD COLUMN IF NOT EXISTS global_agent_id text NOT NULL DEFAULT ''
  `);
  await client.query(`
    ALTER TABLE ${SHIPMENTS_TABLE}
    ADD COLUMN IF NOT EXISTS customer_goods_id text NOT NULL DEFAULT ''
  `);
  await client.query(`
    ALTER TABLE ${SHIPMENTS_TABLE}
    ADD COLUMN IF NOT EXISTS goods_description_print text NOT NULL DEFAULT ''
  `);
  await client.query(`
    ALTER TABLE ${SHIPMENTS_TABLE}
    DROP CONSTRAINT IF EXISTS shipments_customer_agent_id_fkey
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMER_AGENTS_TABLE} (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES ${CUSTOMERS_TABLE}(id) ON DELETE CASCADE,
      label text NOT NULL DEFAULT '',
      agent_name text NOT NULL DEFAULT '',
      agent_address text NOT NULL DEFAULT '',
      agent_phone text NOT NULL DEFAULT '',
      agent_email text NOT NULL DEFAULT '',
      agent_vat_code text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_customer_agents_customer ON ${CUSTOMER_AGENTS_TABLE}(customer_id)`
  );
  await client.query(`
    ALTER TABLE ${SHIPMENTS_TABLE}
    ADD COLUMN IF NOT EXISTS customer_agent_id text REFERENCES ${CUSTOMER_AGENTS_TABLE}(id) ON DELETE SET NULL
  `);
  await ensureAirlineCatalogSchema(client);
  await ensureAirportSchema(client);
  await seedAirlineCatalogIfEmpty(client);
  await seedAirportsIfEmpty(client);
  await ensureWeighSlipSchema(client);
}

function str(v) {
  return typeof v === "string" ? v : "";
}

function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function intOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

function jsonOrNull(v) {
  return v == null ? null : JSON.stringify(v);
}

function savedConsigneeFromRow(row) {
  return {
    id: row.id || "",
    label: row.label || "",
    consigneeName: row.consignee_name || "",
    consigneeAddress: row.consignee_address || "",
    consigneePhone: row.consignee_phone || "",
    consigneeEmail: row.consignee_email || "",
    notifyName: row.notify_name || "",
  };
}

function savedShipperFromRow(row) {
  return {
    id: row.id || "",
    label: row.label || "",
    shipperName: row.shipper_name || "",
    shipperAddress: row.shipper_address || "",
    shipperPhone: row.shipper_phone || "",
    shipperEmail: row.shipper_email || "",
    taxCode: row.shipper_vat_code || "",
  };
}

function savedAgentFromRow(row) {
  return {
    id: row.id || "",
    label: row.label || "",
    agentName: row.agent_name || "",
    agentAddress: row.agent_address || "",
    agentPhone: row.agent_phone || "",
    agentEmail: row.agent_email || "",
    agentTaxCode: row.agent_vat_code || "",
  };
}

function partyFromRow(row) {
  const type = str(row.party_type).toUpperCase();
  const allowed = new Set(["SHIPPER", "CNEE", "NOTIFY", "OTHER"]);
  return {
    id: row.id || "",
    type: allowed.has(type) ? type : "OTHER",
    label: row.label || "",
    content: row.content || "",
  };
}

function customerProfileFromRow(row, savedShippers = [], savedConsignees = [], parties = []) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    savedShippers,
    savedConsignees,
    parties,
  };
}

function shipmentFromRow(row) {
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
    warehouse: row.warehouse,
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
    status: row.status,
  };
}

async function loadRelationalSnapshot(client, key) {
  const [customerRes, consigneeRes, shipperRes, partyRes, shipmentRes, metaRes, jsonRes] = await Promise.all([
    client.query(
      `
      SELECT c.id, c.code, c.name,
             p.shipper_name, p.shipper_address, p.shipper_phone, p.shipper_email, p.shipper_vat_code,
             p.agent_name, p.agent_address, p.agent_phone, p.agent_email, p.agent_vat_code,
             p.consignee_name, p.consignee_address, p.consignee_phone, p.consignee_email, p.notify_name
      FROM ${CUSTOMERS_TABLE} c
      LEFT JOIN ${CUSTOMER_PROFILES_TABLE} p ON p.customer_id = c.id
      ORDER BY c.code ASC, c.name ASC
      `
    ),
    client.query(
      `SELECT * FROM ${CUSTOMER_CONSIGNEES_TABLE} ORDER BY customer_id ASC, sort_order ASC, id ASC`
    ),
    client.query(`SELECT * FROM ${CUSTOMER_SHIPPERS_TABLE} ORDER BY customer_id ASC, sort_order ASC, id ASC`),
    client.query(
      `SELECT * FROM ${CUSTOMER_PARTIES_TABLE} ORDER BY customer_id ASC, sort_order ASC, id ASC`
    ),
    client.query(`SELECT * FROM ${SHIPMENTS_TABLE} ORDER BY session_date ASC, warehouse ASC, stt ASC, id ASC`),
    client.query(`SELECT version FROM ${STATE_META_TABLE} WHERE id = $1`, [key]),
    client.query(`SELECT state FROM ${TABLE_NAME} WHERE id = $1`, [key]),
  ]);
  if (customerRes.rows.length === 0 && shipmentRes.rows.length === 0) return null;
  const blob = jsonRes.rows[0]?.state;
  const blobOverrides =
    blob && typeof blob === "object" ? blob.airlineLabelOverrides : undefined;
  await migrateAirlineOverridesFromBlob(client, blobOverrides);
  const airlineLabelOverrides = await loadAirlineDisplayOverrides(client);
  const printerProfiles = normalizePrinterProfilesCatalogLoose(
    blob && typeof blob === "object" ? blob.printerProfiles : undefined
  );
  const globalAgents = normalizeGlobalAgentsLoose(
    blob && typeof blob === "object" ? blob.globalAgents : undefined
  );
  const scscWeighPrintSettings = normalizeScscWeighPrintSettingsLoose(
    blob && typeof blob === "object" ? blob.scscWeighPrintSettings : undefined
  );
  const consigneeByCustomer = new Map();
  for (const r of consigneeRes.rows) {
    const cid = str(r.customer_id).trim();
    if (!cid) continue;
    if (!consigneeByCustomer.has(cid)) consigneeByCustomer.set(cid, []);
    consigneeByCustomer.get(cid).push(savedConsigneeFromRow(r));
  }
  const shipperByCustomer = new Map();
  for (const r of shipperRes.rows) {
    const cid = str(r.customer_id).trim();
    if (!cid) continue;
    if (!shipperByCustomer.has(cid)) shipperByCustomer.set(cid, []);
    shipperByCustomer.get(cid).push(savedShipperFromRow(r));
  }
  const partiesByCustomer = new Map();
  for (const r of partyRes.rows) {
    const cid = str(r.customer_id).trim();
    if (!cid) continue;
    if (!partiesByCustomer.has(cid)) partiesByCustomer.set(cid, []);
    partiesByCustomer.get(cid).push(partyFromRow(r));
  }
  const blobCustomersById = new Map();
  if (blob && typeof blob === "object" && Array.isArray(blob.customers)) {
    for (const bc of blob.customers) {
      if (!bc || typeof bc !== "object") continue;
      const cid = str(bc.id).trim();
      if (cid) blobCustomersById.set(cid, bc);
    }
  }
  return {
    version: Number(metaRes.rows[0]?.version ?? 1),
    rows: shipmentRes.rows.map(shipmentFromRow),
    customers: customerRes.rows.map((row) => {
      const cid = str(row.id).trim();
      const base = customerProfileFromRow(
        row,
        shipperByCustomer.get(cid) ?? [],
        consigneeByCustomer.get(cid) ?? [],
        partiesByCustomer.get(cid) ?? []
      );
      const fromBlob = blobCustomersById.get(cid);
      const savedGoods = Array.isArray(fromBlob?.savedGoods) ? fromBlob.savedGoods : [];
      return savedGoods.length ? { ...base, savedGoods } : base;
    }),
    airlineLabelOverrides,
    printerProfiles,
    globalAgents,
    scscWeighPrintSettings,
  };
}

async function replaceRelationalSnapshot(client, key, state) {
  const customers = Array.isArray(state.customers) ? state.customers : [];
  const rows = Array.isArray(state.rows) ? state.rows : [];

  await client.query(`DELETE FROM ${SHIPMENTS_TABLE}`);
  await client.query(`DELETE FROM ${CUSTOMER_CONSIGNEES_TABLE}`);
  await client.query(`DELETE FROM ${CUSTOMER_SHIPPERS_TABLE}`);
  await client.query(`DELETE FROM ${CUSTOMER_PARTIES_TABLE}`);
  await client.query(`DELETE FROM ${CUSTOMER_PROFILES_TABLE}`);
  await client.query(`DELETE FROM ${CUSTOMERS_TABLE}`);
  await saveAirlineDisplayOverrides(
    client,
    normalizeAirlineLabelOverridesLoose(state.airlineLabelOverrides)
  );

  for (const c of customers) {
    const customerId = str(c.id).trim();
    if (!customerId) continue;
    await client.query(
      `INSERT INTO ${CUSTOMERS_TABLE} (id, code, name, updated_at) VALUES ($1,$2,$3,now())`,
      [customerId, str(c.code), str(c.name)]
    );
    const shippers = Array.isArray(c.savedShippers) ? c.savedShippers : [];
    const primaryShipper = shippers[0];
    const primaryCnee = Array.isArray(c.savedConsignees) ? c.savedConsignees[0] : undefined;
    await client.query(
      `
      INSERT INTO ${CUSTOMER_PROFILES_TABLE} (
        customer_id, shipper_name, shipper_address, shipper_phone, shipper_email, shipper_vat_code,
        agent_name, agent_address, agent_phone, agent_email, agent_vat_code,
        consignee_name, consignee_address, consignee_phone, consignee_email, notify_name, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16, now()
      )
      `,
      [
        customerId,
        str(primaryShipper?.shipperName) || str(c.shipperName),
        str(primaryShipper?.shipperAddress) || str(c.shipperAddress),
        str(primaryShipper?.shipperPhone) || str(c.shipperPhone),
        str(primaryShipper?.shipperEmail) || str(c.shipperEmail),
        str(primaryShipper?.taxCode) || str(c.taxCode),
        "",
        "",
        "",
        "",
        "",
        str(primaryCnee?.consigneeName) || str(c.consigneeName),
        str(primaryCnee?.consigneeAddress) || str(c.consigneeAddress),
        str(primaryCnee?.consigneePhone) || str(c.consigneePhone),
        str(primaryCnee?.consigneeEmail) || str(c.consigneeEmail),
        str(primaryCnee?.notifyName) || str(c.notifyName),
      ]
    );
    let shipperOrder = 0;
    for (const ss of shippers) {
      const sid = str(ss.id).trim();
      if (!sid) continue;
      await client.query(
        `
        INSERT INTO ${CUSTOMER_SHIPPERS_TABLE} (
          id, customer_id, label, shipper_name, shipper_address, shipper_phone, shipper_email, shipper_vat_code, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          sid,
          customerId,
          str(ss.label),
          str(ss.shipperName),
          str(ss.shipperAddress),
          str(ss.shipperPhone),
          str(ss.shipperEmail),
          str(ss.taxCode),
          shipperOrder++,
        ]
      );
    }
    const subs = Array.isArray(c.savedConsignees) ? c.savedConsignees : [];
    let sortOrder = 0;
    for (const sc of subs) {
      const sid = str(sc.id).trim();
      if (!sid) continue;
      await client.query(
        `
        INSERT INTO ${CUSTOMER_CONSIGNEES_TABLE} (
          id, customer_id, label, consignee_name, consignee_address, consignee_phone, consignee_email, notify_name, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          sid,
          customerId,
          str(sc.label),
          str(sc.consigneeName),
          str(sc.consigneeAddress),
          str(sc.consigneePhone),
          str(sc.consigneeEmail),
          str(sc.notifyName),
          sortOrder++,
        ]
      );
    }
    const parties = Array.isArray(c.parties) ? c.parties : [];
    let partyOrder = 0;
    for (const p of parties) {
      const pid = str(p.id).trim();
      if (!pid) continue;
      const ptype = str(p.type).toUpperCase();
      const allowed = new Set(["SHIPPER", "CNEE", "NOTIFY", "OTHER"]);
      await client.query(
        `
        INSERT INTO ${CUSTOMER_PARTIES_TABLE} (id, customer_id, party_type, label, content, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          pid,
          customerId,
          allowed.has(ptype) ? ptype : "OTHER",
          str(p.label),
          str(p.content),
          partyOrder++,
        ]
      );
    }
  }

  for (const s of rows) {
    await client.query(
      `
      INSERT INTO ${SHIPMENTS_TABLE} (
        id, stt, session_date, awb, hawb, flight, flight_date, cutoff, cutoff_note, note, dest, warehouse,
        pcs, kg, dim_weight_kg, dim_lines, dim_divisor,
        customer, customer_code, customer_id, customer_shipper_id, customer_consignee_id, customer_agent_id,
        global_agent_id, customer_goods_id, goods_description_print,
        shipper_name_print, shipper_address_print, shipper_phone_print, shipper_email_print, tax_code_print,
        agent_name_print, agent_address_print, agent_phone_print, agent_email_print, agent_tax_code_print,
        consignee_name_print, consignee_address_print, consignee_phone_print, consignee_email_print, notify_name_print,
        status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16::jsonb,$17,
        $18,$19,$20,$21,$22,$23,
        $24,$25,$26,
        $27,$28,$29,$30,$31,
        $32,$33,$34,$35,$36,
        $37,$38,$39,$40,$41,
        $42
      )
      `,
      [
        str(s.id),
        intOrNull(s.stt) ?? 0,
        str(s.sessionDate),
        str(s.awb),
        str(s.hawb),
        str(s.flight),
        str(s.flightDate),
        str(s.cutoff),
        str(s.cutoffNote),
        str(s.note),
        str(s.dest),
        str(s.warehouse),
        intOrNull(s.pcs),
        numOrNull(s.kg),
        numOrNull(s.dimWeightKg),
        jsonOrNull(s.dimLines),
        intOrNull(s.dimDivisor),
        str(s.customer),
        str(s.customerCode),
        str(s.customerId) || null,
        str(s.customerShipperId) || null,
        str(s.customerConsigneeId) || null,
        str(s.customerAgentId) || null,
        str(s.globalAgentId) || str(s.customerAgentId) || "",
        str(s.customerGoodsId) || "",
        str(s.goodsDescriptionPrint) || "",
        str(s.shipperNamePrint),
        str(s.shipperAddressPrint),
        str(s.shipperPhonePrint),
        str(s.shipperEmailPrint),
        str(s.taxCodePrint),
        str(s.agentNamePrint),
        str(s.agentAddressPrint),
        str(s.agentPhonePrint),
        str(s.agentEmailPrint),
        str(s.agentTaxCodePrint),
        str(s.consigneeNamePrint),
        str(s.consigneeAddressPrint),
        str(s.consigneePhonePrint),
        str(s.consigneeEmailPrint),
        str(s.notifyNamePrint),
        str(s.status),
      ]
    );
  }

  await client.query(
    `
    INSERT INTO ${STATE_META_TABLE} (id, version, updated_at)
    VALUES ($1,$2,now())
    ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = now()
    `,
    [key, Number(state.version || 1)]
  );
  await client.query(
    `
    INSERT INTO ${TABLE_NAME} (id, state, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (id)
    DO UPDATE SET state = EXCLUDED.state, updated_at = now()
    `,
    [key, JSON.stringify(state)]
  );
}

export function createPostgresStateStore(databaseUrl) {
  const pool = makePool(databaseUrl);
  const key = stateKey();
  let schemaReady = false;

  async function withClient(fn) {
    const client = await pool.connect();
    try {
      if (!schemaReady) {
        await ensureSchema(client);
        schemaReady = true;
      }
      return await fn(client);
    } finally {
      client.release();
    }
  }

  return {
    key,
    async loadRawState() {
      return withClient(async (client) => {
        const relational = await loadRelationalSnapshot(client, key);
        if (relational) return relational;
        const res = await client.query(`SELECT state FROM ${TABLE_NAME} WHERE id = $1`, [key]);
        return res.rows[0]?.state ?? null;
      });
    },
    async saveState(state) {
      await withClient(async (client) => {
        await client.query("BEGIN");
        try {
          await replaceRelationalSnapshot(client, key, state);
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
      });
    },
    async runLocked(fn) {
      return withClient(async (client) => {
        await client.query("BEGIN");
        try {
          // Advisory transaction lock avoids a race when the row has not been inserted yet.
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
          await client.query(`SELECT version FROM ${STATE_META_TABLE} WHERE id = $1 FOR UPDATE`, [key]);
          const currentRaw = await loadRelationalSnapshot(client, key);
          const next = await fn(currentRaw);
          await replaceRelationalSnapshot(client, key, next);
          await client.query("COMMIT");
          return next;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
      });
    },
    async close() {
      await pool.end();
    },
  };
}
