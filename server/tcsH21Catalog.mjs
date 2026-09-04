/**
 * Catalog H21 kho TCS — Postgres master table + seed từ data/tcs-h21/catalog.json.
 * Không gắn TECS-TCS / SCSC / TECS-SCSC.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TCS_H21_WAREHOUSE_SCOPE,
  clampTcsH21Catalog,
  findDuplicateTcsH21Descriptions,
  normalizeTcsH21CatalogItem,
  tcsH21DescriptionKey,
} from "../shared/tcsH21CatalogNormalize.mjs";

export const TCS_H21_GOODS_TABLE = "tcs_h21_goods";
export const TCS_H21_STAMPS_TABLE = "tcs_h21_stamp_ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_CATALOG = path.resolve(__dirname, "../data/tcs-h21/catalog.json");
const SEED_STAMPS = path.resolve(__dirname, "../data/tcs-h21/stamp-ids.json");

function rowToItem(row) {
  return normalizeTcsH21CatalogItem(
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
      warehouseScope: TCS_H21_WAREHOUSE_SCOPE,
    },
    { keepId: true }
  );
}

export async function ensureTcsH21CatalogSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TCS_H21_GOODS_TABLE} (
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
      warehouse_scope text NOT NULL DEFAULT 'TCS',
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT tcs_h21_goods_scope_chk CHECK (warehouse_scope = 'TCS')
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tcs_h21_goods_category
      ON ${TCS_H21_GOODS_TABLE}(category)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tcs_h21_goods_active_sort
      ON ${TCS_H21_GOODS_TABLE}(active, sort_order, description)
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tcs_h21_goods_description_ci
      ON ${TCS_H21_GOODS_TABLE} (lower(btrim(description)))
      WHERE warehouse_scope = 'TCS'
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TCS_H21_STAMPS_TABLE} (
      id text PRIMARY KEY,
      shipper_name text NOT NULL DEFAULT '',
      shipper_address text NOT NULL DEFAULT '',
      shipper_phone text NOT NULL DEFAULT '',
      stamp_id text NOT NULL DEFAULT '',
      active boolean NOT NULL DEFAULT true,
      warehouse_scope text NOT NULL DEFAULT 'TCS',
      CONSTRAINT tcs_h21_stamps_scope_chk CHECK (warehouse_scope = 'TCS')
    )
  `);
  await client.query(`
    ALTER TABLE ${TCS_H21_STAMPS_TABLE}
    ADD COLUMN IF NOT EXISTS shipper_address text NOT NULL DEFAULT ''
  `);
  await client.query(`
    ALTER TABLE ${TCS_H21_STAMPS_TABLE}
    ADD COLUMN IF NOT EXISTS shipper_phone text NOT NULL DEFAULT ''
  `);
  await client.query(`
    ALTER TABLE ${TCS_H21_STAMPS_TABLE}
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true
  `);
  await client.query(`
    ALTER TABLE ${TCS_H21_STAMPS_TABLE}
    ADD COLUMN IF NOT EXISTS seal_image_data text NULL
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

export async function seedTcsH21CatalogIfEmpty(client) {
  const existing = await client.query(`SELECT 1 FROM ${TCS_H21_GOODS_TABLE} LIMIT 1`);
  if (existing.rows.length > 0) return { seeded: false, count: 0 };

  const seed = await loadSeedJson(SEED_CATALOG);
  const items = clampTcsH21Catalog(seed?.items ?? []);
  for (const item of items) {
    await insertGoods(client, item);
  }

  const stampExisting = await client.query(`SELECT 1 FROM ${TCS_H21_STAMPS_TABLE} LIMIT 1`);
  if (stampExisting.rows.length === 0) {
    const stampSeed = await loadSeedJson(SEED_STAMPS);
    const stamps = Array.isArray(stampSeed?.items) ? stampSeed.items : [];
    for (const s of stamps) {
      const id = String(s.id || "").trim();
      const shipperName = String(s.shipperName || "").trim();
      const shipperAddress = String(s.shipperAddress || "").trim();
      const shipperPhone = String(s.shipperPhone || "").trim();
      const stampId = String(s.stampId || "").trim().toUpperCase();
      if (!id || !stampId) continue;
      await client.query(
        `
        INSERT INTO ${TCS_H21_STAMPS_TABLE} (id, shipper_name, shipper_address, shipper_phone, stamp_id, warehouse_scope, active)
        VALUES ($1,$2,$3,$4,$5,'TCS',true)
        ON CONFLICT (id) DO NOTHING
        `,
        [id, shipperName, shipperAddress, shipperPhone, stampId]
      );
    }
  }

  return { seeded: true, count: items.length };
}

async function insertGoods(client, item) {
  await client.query(
    `
    INSERT INTO ${TCS_H21_GOODS_TABLE} (
      id, category, description, hs_code, origin,
      qty1, uom1, qty2, uom2, unit_price, amount, unit_factor,
      sort_order, warehouse_scope, active, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,$10,$11,$12,
      $13,'TCS',$14,now()
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
export async function listTcsH21Goods(client, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000);
  const q = String(opts.q || "").trim();
  const activeOnly = opts.activeOnly !== false;
  const params = [];
  const where = [`warehouse_scope = 'TCS'`];
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
    SELECT * FROM ${TCS_H21_GOODS_TABLE}
    WHERE ${where.join(" AND ")}
    ORDER BY sort_order ASC, category ASC, description ASC
    LIMIT $${params.length}
    `,
    params
  );
  return res.rows.map(rowToItem).filter(Boolean);
}

export async function getTcsH21Goods(client, id) {
  const res = await client.query(
    `SELECT * FROM ${TCS_H21_GOODS_TABLE} WHERE id = $1 AND warehouse_scope = 'TCS'`,
    [String(id || "")]
  );
  return rowToItem(res.rows[0]);
}

async function assertDescriptionUnique(client, description, exceptId = "") {
  const key = tcsH21DescriptionKey(description);
  if (!key) {
    const err = new Error("Mô tả hàng không được để trống");
    err.statusCode = 400;
    err.code = "TCS_H21_DESC_REQUIRED";
    throw err;
  }
  const params = [key];
  let sql = `
    SELECT id, description FROM ${TCS_H21_GOODS_TABLE}
    WHERE warehouse_scope = 'TCS'
      AND lower(btrim(description)) = $1
  `;
  if (exceptId) {
    params.push(String(exceptId));
    sql += ` AND id <> $${params.length}`;
  }
  sql += ` LIMIT 1`;
  const res = await client.query(sql, params);
  if (res.rows[0]) {
    const err = new Error(
      `Mô tả đã tồn tại — không được trùng: «${res.rows[0].description}»`
    );
    err.statusCode = 409;
    err.code = "TCS_H21_DESC_DUPLICATE";
    err.conflictId = res.rows[0].id;
    throw err;
  }
}

function duplicateError(description, sampleList = []) {
  const sample = sampleList.slice(0, 3).join("; ");
  const more = sampleList.length > 3 ? ` …(+${sampleList.length - 3})` : "";
  const err = new Error(
    sample
      ? `File/danh sách có mô tả trùng — không cho nhập: ${sample}${more}`
      : `Mô tả trùng — không cho nhập: «${description}»`
  );
  err.statusCode = 409;
  err.code = "TCS_H21_DESC_DUPLICATE";
  return err;
}

export async function createTcsH21Goods(client, raw) {
  const item = normalizeTcsH21CatalogItem(raw, { keepId: Boolean(raw?.id) });
  if (!item) {
    const err = new Error("Mặt hàng không hợp lệ (thiếu mô tả)");
    err.statusCode = 400;
    throw err;
  }
  await assertDescriptionUnique(client, item.description);
  const maxSort = await client.query(
    `SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM ${TCS_H21_GOODS_TABLE}`
  );
  item.sortOrder = (maxSort.rows[0]?.m ?? -1) + 1;
  try {
    await insertGoods(client, item);
  } catch (e) {
    if (e?.code === "23505") {
      throw duplicateError(item.description);
    }
    throw e;
  }
  return getTcsH21Goods(client, item.id);
}

export async function updateTcsH21Goods(client, id, patch) {
  const current = await getTcsH21Goods(client, id);
  if (!current) {
    const err = new Error("Không tìm thấy mặt hàng");
    err.statusCode = 404;
    throw err;
  }
  const next = normalizeTcsH21CatalogItem(
    { ...current, ...patch, id: current.id, warehouseScope: TCS_H21_WAREHOUSE_SCOPE },
    { keepId: true }
  );
  if (!next) {
    const err = new Error("Dữ liệu cập nhật không hợp lệ");
    err.statusCode = 400;
    throw err;
  }
  await assertDescriptionUnique(client, next.description, current.id);
  try {
    await insertGoods(client, next);
  } catch (e) {
    if (e?.code === "23505") {
      throw duplicateError(next.description);
    }
    throw e;
  }
  return getTcsH21Goods(client, current.id);
}

export async function deleteTcsH21Goods(client, id) {
  const res = await client.query(
    `DELETE FROM ${TCS_H21_GOODS_TABLE} WHERE id = $1 AND warehouse_scope = 'TCS' RETURNING id`,
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
 * Import/merge danh sách (Excel hoặc JSON).
 * - Trùng mô tả trong file → từ chối toàn bộ (409).
 * - Trùng mô tả với DB → cập nhật bản ghi đó (không tạo dòng thứ hai).
 * @returns {{ created: number, updated: number, items: object[] }}
 */
export async function upsertTcsH21GoodsBulk(client, rawList) {
  const incoming = clampTcsH21Catalog(rawList);
  const fileDups = findDuplicateTcsH21Descriptions(incoming);
  if (fileDups.length) {
    throw duplicateError(
      "",
      fileDups.map((d) => `«${d.description}» (×${d.ids.length})`)
    );
  }
  const existing = await listTcsH21Goods(client, { activeOnly: false, limit: 2000 });
  const byDesc = new Map(
    existing.map((x) => [tcsH21DescriptionKey(x.description), x])
  );
  let created = 0;
  let updated = 0;
  const out = [];
  for (const item of incoming) {
    const key = tcsH21DescriptionKey(item.description);
    const prev = byDesc.get(key);
    if (prev) {
      const saved = await updateTcsH21Goods(client, prev.id, {
        ...item,
        id: prev.id,
        sortOrder: prev.sortOrder,
      });
      updated += 1;
      out.push(saved);
    } else {
      const saved = await createTcsH21Goods(client, item);
      created += 1;
      byDesc.set(key, saved);
      out.push(saved);
    }
  }
  return { created, updated, items: out };
}

/**
 * Danh sách shipper — mặc định không trả base64 con dấu (payload nhẹ).
 * `includeSeal=true` dùng khi mở invoice cần ảnh ngay.
 */
export async function listTcsH21Stamps(client, opts = {}) {
  const includeSeal = opts?.includeSeal === true;
  const res = await client.query(
    includeSeal
      ? `SELECT id, shipper_name, shipper_address, shipper_phone, stamp_id, active, seal_image_data,
                (seal_image_data IS NOT NULL AND length(seal_image_data) > 0) AS has_seal
         FROM ${TCS_H21_STAMPS_TABLE}
         WHERE warehouse_scope = 'TCS' ORDER BY shipper_name ASC`
      : `SELECT id, shipper_name, shipper_address, shipper_phone, stamp_id, active,
                (seal_image_data IS NOT NULL AND length(seal_image_data) > 0) AS has_seal
         FROM ${TCS_H21_STAMPS_TABLE}
         WHERE warehouse_scope = 'TCS' ORDER BY shipper_name ASC`
  );
  return res.rows.map((r) => rowToStamp(r, { includeSeal })).filter(Boolean);
}

function rowToStamp(row, opts = {}) {
  const includeSeal = opts?.includeSeal === true;
  const hasSeal =
    row.has_seal === true ||
    row.has_seal === 1 ||
    (typeof row.seal_image_data === "string" && row.seal_image_data.length > 0);
  const base = normalizeTcsH21Stamp({
    id: row.id,
    shipperName: row.shipper_name,
    shipperAddress: row.shipper_address,
    shipperPhone: row.shipper_phone,
    stampId: row.stamp_id,
    active: row.active,
    sealImageData: includeSeal ? row.seal_image_data ?? null : null,
    warehouseScope: TCS_H21_WAREHOUSE_SCOPE,
  });
  if (!base) return null;
  return { ...base, hasSealImage: Boolean(hasSeal) };
}

function stampId() {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return `stamp-${globalThis.crypto.randomUUID()}`;
  }
  return `stamp-${Date.now().toString(36)}`;
}

/** @param {unknown} v */
export function normalizeTcsH21SealImageData(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(s)) return null;
  if (s.length > 900_000) return null;
  return s;
}

export function normalizeTcsH21Stamp(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const shipperName = String(o.shipperName ?? o.shipper_name ?? "").trim();
  const stamp = String(o.stampId ?? o.stamp_id ?? "").trim().toUpperCase();
  if (!shipperName && !stamp) return null;
  const id = String(o.id ?? "").trim() || stampId();
  const active = o.active === false || o.active === 0 || o.active === "0" ? false : true;
  const sealImageData = normalizeTcsH21SealImageData(o.sealImageData ?? o.seal_image_data);
  return {
    id,
    shipperName,
    shipperAddress: String(o.shipperAddress ?? o.shipper_address ?? "").trim(),
    shipperPhone: String(o.shipperPhone ?? o.shipper_phone ?? "").trim(),
    stampId: stamp,
    active,
    warehouseScope: TCS_H21_WAREHOUSE_SCOPE,
    sealImageData,
  };
}

export async function createTcsH21Stamp(client, raw) {
  const item = normalizeTcsH21Stamp(raw);
  if (!item || !item.shipperName || !item.stampId) {
    const err = new Error("Shipper tờ khai cần tên và Stamp ID");
    err.statusCode = 400;
    throw err;
  }
  await client.query(
    `
    INSERT INTO ${TCS_H21_STAMPS_TABLE}
      (id, shipper_name, shipper_address, shipper_phone, stamp_id, warehouse_scope, active, seal_image_data)
    VALUES ($1,$2,$3,$4,$5,'TCS',$6,$7)
    `,
    [
      item.id,
      item.shipperName,
      item.shipperAddress,
      item.shipperPhone,
      item.stampId,
      item.active,
      item.sealImageData ?? null,
    ]
  );
  return { ...item, hasSealImage: Boolean(item.sealImageData) };
}

export async function updateTcsH21Stamp(client, id, patch) {
  const current = await getTcsH21Stamp(client, id);
  if (!current) {
    const err = new Error("Không tìm thấy shipper tờ khai");
    err.statusCode = 404;
    throw err;
  }
  const patchObj = patch && typeof patch === "object" ? patch : {};
  const sealInPatch =
    Object.prototype.hasOwnProperty.call(patchObj, "sealImageData") ||
    Object.prototype.hasOwnProperty.call(patchObj, "seal_image_data");
  const next = normalizeTcsH21Stamp({
    ...current,
    ...patchObj,
    id: current.id,
    sealImageData: sealInPatch
      ? patchObj.sealImageData ?? patchObj.seal_image_data ?? null
      : current.sealImageData ?? null,
  });
  if (!next) {
    const err = new Error("Dữ liệu shipper không hợp lệ");
    err.statusCode = 400;
    throw err;
  }
  await client.query(
    `
    UPDATE ${TCS_H21_STAMPS_TABLE}
    SET shipper_name=$2, shipper_address=$3, shipper_phone=$4, stamp_id=$5, active=$6, seal_image_data=$7
    WHERE id=$1 AND warehouse_scope='TCS'
    `,
    [
      next.id,
      next.shipperName,
      next.shipperAddress,
      next.shipperPhone,
      next.stampId,
      next.active,
      next.sealImageData ?? null,
    ]
  );
  return { ...next, hasSealImage: Boolean(next.sealImageData) };
}

export async function getTcsH21Stamp(client, id) {
  const res = await client.query(
    `SELECT id, shipper_name, shipper_address, shipper_phone, stamp_id, active, seal_image_data,
            (seal_image_data IS NOT NULL AND length(seal_image_data) > 0) AS has_seal
     FROM ${TCS_H21_STAMPS_TABLE} WHERE id=$1 AND warehouse_scope='TCS' LIMIT 1`,
    [String(id)]
  );
  return res.rows[0] ? rowToStamp(res.rows[0], { includeSeal: true }) : null;
}

export async function deleteTcsH21Stamp(client, id) {
  const res = await client.query(
    `DELETE FROM ${TCS_H21_STAMPS_TABLE} WHERE id=$1 AND warehouse_scope='TCS' RETURNING id`,
    [String(id)]
  );
  if (!res.rows[0]) {
    const err = new Error("Không tìm thấy shipper tờ khai");
    err.statusCode = 404;
    throw err;
  }
  return { id: res.rows[0].id };
}

export async function replaceAllTcsH21Goods(client, rawList) {
  const items = clampTcsH21Catalog(rawList);
  const fileDups = findDuplicateTcsH21Descriptions(items);
  if (fileDups.length) {
    throw duplicateError(
      "",
      fileDups.map((d) => `«${d.description}» (×${d.ids.length})`)
    );
  }
  await client.query(`DELETE FROM ${TCS_H21_GOODS_TABLE} WHERE warehouse_scope = 'TCS'`);
  let i = 0;
  for (const item of items) {
    item.sortOrder = i++;
    try {
      await insertGoods(client, item);
    } catch (e) {
      if (e?.code === "23505") throw duplicateError(item.description);
      throw e;
    }
  }
  return listTcsH21Goods(client, { activeOnly: false, limit: 2000 });
}
