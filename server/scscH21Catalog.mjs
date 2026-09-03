/**
 * Catalog H21 kho SCSC — Postgres master table + seed từ data/scsc-h21/catalog.json.
 * Không gắn TECS-SCSC / TCS / TECS-TCS.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCSC_H21_WAREHOUSE_SCOPE,
  clampScscH21Catalog,
  findDuplicateScscH21Descriptions,
  normalizeScscH21CatalogItem,
  scscH21DescriptionKey,
} from "../shared/scscH21CatalogNormalize.mjs";

export const SCSC_H21_GOODS_TABLE = "scsc_h21_goods";
export const SCSC_H21_STAMPS_TABLE = "scsc_h21_stamp_ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_CATALOG = path.resolve(__dirname, "../data/scsc-h21/catalog.json");
const SEED_STAMPS = path.resolve(__dirname, "../data/scsc-h21/stamp-ids.json");

function rowToItem(row) {
  return normalizeScscH21CatalogItem(
    {
      id: row.id,
      category: row.category,
      description: row.description,
      hsCode: row.hs_code,
      origin: row.origin,
      qty1: row.qty1 != null ? Number(row.qty1) : 0,
      uom1: row.uom1,
      qty2: row.qty2 != null ? Number(row.qty2) : 0,
      uom2: row.uom2,
      unitPrice: row.unit_price != null ? Number(row.unit_price) : 0,
      amount: row.amount != null ? Number(row.amount) : 0,
      unitFactor: row.unit_factor != null ? Number(row.unit_factor) : 0,
      sortOrder: row.sort_order,
      active: row.active,
      updatedAt: row.updated_at,
      warehouseScope: SCSC_H21_WAREHOUSE_SCOPE,
    },
    { keepId: true }
  );
}

export async function ensureScscH21CatalogSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${SCSC_H21_GOODS_TABLE} (
      id text PRIMARY KEY,
      category text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      hs_code text NOT NULL DEFAULT '',
      origin text NOT NULL DEFAULT 'VIETNAM',
      qty1 double precision NOT NULL DEFAULT 0,
      uom1 text NOT NULL DEFAULT 'PCE',
      qty2 double precision NOT NULL DEFAULT 0,
      uom2 text NOT NULL DEFAULT 'KGM',
      unit_price double precision NOT NULL DEFAULT 0,
      amount double precision NOT NULL DEFAULT 0,
      unit_factor double precision NOT NULL DEFAULT 0,
      sort_order integer NOT NULL DEFAULT 0,
      warehouse_scope text NOT NULL DEFAULT 'SCSC',
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT scsc_h21_goods_scope_chk CHECK (warehouse_scope = 'SCSC')
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scsc_h21_goods_category
      ON ${SCSC_H21_GOODS_TABLE}(category)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scsc_h21_goods_active_sort
      ON ${SCSC_H21_GOODS_TABLE}(active, sort_order, description)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${SCSC_H21_STAMPS_TABLE} (
      id text PRIMARY KEY,
      shipper_name text NOT NULL DEFAULT '',
      stamp_id text NOT NULL DEFAULT '',
      warehouse_scope text NOT NULL DEFAULT 'SCSC',
      CONSTRAINT scsc_h21_stamps_scope_chk CHECK (warehouse_scope = 'SCSC')
    )
  `);
}

async function loadSeedJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function seedScscH21CatalogIfEmpty(client) {
  const existing = await client.query(`SELECT 1 FROM ${SCSC_H21_GOODS_TABLE} LIMIT 1`);
  if (existing.rows.length > 0) return { seeded: false, count: 0 };

  const seed = await loadSeedJson(SEED_CATALOG);
  const items = clampScscH21Catalog(seed?.items ?? []);
  for (const item of items) {
    await insertGoods(client, item);
  }

  const stampExisting = await client.query(`SELECT 1 FROM ${SCSC_H21_STAMPS_TABLE} LIMIT 1`);
  if (stampExisting.rows.length === 0) {
    const stampSeed = await loadSeedJson(SEED_STAMPS);
    const stamps = Array.isArray(stampSeed?.items) ? stampSeed.items : [];
    for (const s of stamps) {
      const id = String(s.id || "").trim();
      const shipperName = String(s.shipperName || "").trim();
      const stampId = String(s.stampId || "").trim().toUpperCase();
      if (!id || !stampId) continue;
      await client.query(
        `
        INSERT INTO ${SCSC_H21_STAMPS_TABLE} (id, shipper_name, stamp_id, warehouse_scope)
        VALUES ($1,$2,$3,'SCSC')
        ON CONFLICT (id) DO NOTHING
        `,
        [id, shipperName, stampId]
      );
    }
  }

  return { seeded: true, count: items.length };
}

async function insertGoods(client, item) {
  await client.query(
    `
    INSERT INTO ${SCSC_H21_GOODS_TABLE} (
      id, category, description, hs_code, origin,
      qty1, uom1, qty2, uom2, unit_price, amount, unit_factor,
      sort_order, warehouse_scope, active, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,$10,$11,$12,
      $13,'SCSC',$14,now()
    )
    ON CONFLICT (id) DO UPDATE SET
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      hs_code = EXCLUDED.hs_code,
      origin = EXCLUDED.origin,
      qty1 = EXCLUDED.qty1,
      uom1 = EXCLUDED.uom1,
      qty2 = EXCLUDED.qty2,
      uom2 = EXCLUDED.uom2,
      unit_price = EXCLUDED.unit_price,
      amount = EXCLUDED.amount,
      unit_factor = EXCLUDED.unit_factor,
      sort_order = EXCLUDED.sort_order,
      active = EXCLUDED.active,
      updated_at = now()
    `,
    [
      item.id,
      item.category,
      item.description,
      item.hsCode,
      item.origin,
      item.qty1,
      item.uom1,
      item.qty2,
      item.uom2,
      item.unitPrice,
      item.amount,
      item.unitFactor,
      item.sortOrder,
      item.active !== false,
    ]
  );
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ q?: string, activeOnly?: boolean, limit?: number }} [opts]
 */
export async function listScscH21Goods(client, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000);
  const q = String(opts.q || "").trim();
  const activeOnly = opts.activeOnly !== false;
  const params = [];
  const where = [`warehouse_scope = 'SCSC'`];
  if (activeOnly) where.push(`active = true`);
  if (q) {
    params.push(`%${q.replace(/[%_]/g, "")}%`);
    where.push(
      `(description ILIKE $${params.length} OR category ILIKE $${params.length} OR hs_code ILIKE $${params.length})`
    );
  }
  params.push(limit);
  const res = await client.query(
    `
    SELECT * FROM ${SCSC_H21_GOODS_TABLE}
    WHERE ${where.join(" AND ")}
    ORDER BY sort_order ASC, category ASC, description ASC
    LIMIT $${params.length}
    `,
    params
  );
  return res.rows.map(rowToItem).filter(Boolean);
}

export async function getScscH21Goods(client, id) {
  const res = await client.query(
    `SELECT * FROM ${SCSC_H21_GOODS_TABLE} WHERE id = $1 AND warehouse_scope = 'SCSC'`,
    [String(id || "")]
  );
  return rowToItem(res.rows[0]);
}

export async function createScscH21Goods(client, raw) {
  const item = normalizeScscH21CatalogItem(raw, { keepId: Boolean(raw?.id) });
  if (!item) {
    const err = new Error("Mặt hàng không hợp lệ (thiếu mô tả)");
    err.statusCode = 400;
    throw err;
  }
  const maxSort = await client.query(
    `SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM ${SCSC_H21_GOODS_TABLE}`
  );
  item.sortOrder = (maxSort.rows[0]?.m ?? -1) + 1;
  await insertGoods(client, item);
  return getScscH21Goods(client, item.id);
}

export async function updateScscH21Goods(client, id, patch) {
  const current = await getScscH21Goods(client, id);
  if (!current) {
    const err = new Error("Không tìm thấy mặt hàng");
    err.statusCode = 404;
    throw err;
  }
  const next = normalizeScscH21CatalogItem(
    { ...current, ...patch, id: current.id, warehouseScope: SCSC_H21_WAREHOUSE_SCOPE },
    { keepId: true }
  );
  if (!next) {
    const err = new Error("Dữ liệu cập nhật không hợp lệ");
    err.statusCode = 400;
    throw err;
  }
  await insertGoods(client, next);
  return getScscH21Goods(client, current.id);
}

export async function deleteScscH21Goods(client, id) {
  const res = await client.query(
    `DELETE FROM ${SCSC_H21_GOODS_TABLE} WHERE id = $1 AND warehouse_scope = 'SCSC' RETURNING id`,
    [String(id || "")]
  );
  if (!res.rows.length) {
    const err = new Error("Không tìm thấy mặt hàng");
    err.statusCode = 404;
    throw err;
  }
  return { id: res.rows[0].id };
}

/**
 * Import/merge danh sách (Excel hoặc JSON). Trùng mô tả (không phân biệt hoa thường) → cập nhật.
 * @returns {{ created: number, updated: number, items: object[] }}
 */
export async function upsertScscH21GoodsBulk(client, rawList) {
  const incoming = clampScscH21Catalog(rawList);
  const existing = await listScscH21Goods(client, { activeOnly: false, limit: 2000 });
  const byDesc = new Map(
    existing.map((x) => [x.description.toLowerCase().replace(/\s+/g, " "), x])
  );
  let created = 0;
  let updated = 0;
  const out = [];
  for (const item of incoming) {
    const key = item.description.toLowerCase().replace(/\s+/g, " ");
    const prev = byDesc.get(key);
    if (prev) {
      const saved = await updateScscH21Goods(client, prev.id, {
        ...item,
        id: prev.id,
        sortOrder: prev.sortOrder,
      });
      updated += 1;
      out.push(saved);
    } else {
      const saved = await createScscH21Goods(client, item);
      created += 1;
      byDesc.set(key, saved);
      out.push(saved);
    }
  }
  return { created, updated, items: out };
}

export async function listScscH21Stamps(client) {
  const res = await client.query(
    `SELECT id, shipper_name, stamp_id FROM ${SCSC_H21_STAMPS_TABLE}
     WHERE warehouse_scope = 'SCSC' ORDER BY shipper_name ASC`
  );
  return res.rows.map((r) => ({
    id: r.id,
    shipperName: r.shipper_name || "",
    stampId: r.stamp_id || "",
    warehouseScope: SCSC_H21_WAREHOUSE_SCOPE,
  }));
}

export async function replaceAllScscH21Goods(client, rawList) {
  const items = clampScscH21Catalog(rawList);
  await client.query(`DELETE FROM ${SCSC_H21_GOODS_TABLE} WHERE warehouse_scope = 'SCSC'`);
  let i = 0;
  for (const item of items) {
    item.sortOrder = i++;
    await insertGoods(client, item);
  }
  return listScscH21Goods(client, { activeOnly: false, limit: 2000 });
}
