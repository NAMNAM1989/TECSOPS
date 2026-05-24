import { randomUUID } from "node:crypto";
import {
  SCSC_DEFAULT_PROFILE,
  SCSC_WEIGH_A4_TEMPLATE,
  SCSC_WEIGH_DEFAULT_FIELDS,
} from "./printTemplateDefaults.mjs";

export const PRINT_TEMPLATES_TABLE = "print_templates";
export const PRINT_PROFILES_TABLE = "print_profiles";
export const PRINT_TEMPLATE_FIELDS_TABLE = "print_template_fields";

export async function ensurePrintTemplateSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PRINT_TEMPLATES_TABLE} (
      id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      page_width_mm numeric(6, 2) NOT NULL DEFAULT 210,
      page_height_mm numeric(6, 2) NOT NULL DEFAULT 297,
      background_asset_url text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PRINT_PROFILES_TABLE} (
      id text PRIMARY KEY,
      template_id text NOT NULL REFERENCES ${PRINT_TEMPLATES_TABLE}(id) ON DELETE CASCADE,
      name text NOT NULL,
      offset_x_mm numeric(6, 2) NOT NULL DEFAULT 0,
      offset_y_mm numeric(6, 2) NOT NULL DEFAULT 0,
      scale_x numeric(6, 4) NOT NULL DEFAULT 1,
      scale_y numeric(6, 4) NOT NULL DEFAULT 1,
      is_default boolean NOT NULL DEFAULT false,
      notes text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_print_profiles_template ON ${PRINT_PROFILES_TABLE}(template_id)`
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PRINT_TEMPLATE_FIELDS_TABLE} (
      id text PRIMARY KEY,
      profile_id text NOT NULL REFERENCES ${PRINT_PROFILES_TABLE}(id) ON DELETE CASCADE,
      field_key text NOT NULL,
      pos_x_mm numeric(7, 3) NOT NULL,
      pos_y_mm numeric(7, 3) NOT NULL,
      width_mm numeric(7, 3),
      font_size_pt numeric(5, 2) NOT NULL DEFAULT 9,
      line_height_mm numeric(6, 3),
      height_mm numeric(6, 3),
      max_lines integer,
      align text NOT NULL DEFAULT 'left'
        CHECK (align IN ('left', 'center', 'right')),
      multiline boolean NOT NULL DEFAULT false,
      bold boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (profile_id, field_key)
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_print_template_fields_profile ON ${PRINT_TEMPLATE_FIELDS_TABLE}(profile_id)`
  );
}

export async function seedPrintTemplatesIfEmpty(client) {
  const existing = await client.query(
    `SELECT id FROM ${PRINT_TEMPLATES_TABLE} WHERE code = $1`,
    [SCSC_WEIGH_A4_TEMPLATE.code]
  );
  if (existing.rows.length > 0) return;

  const tpl = SCSC_WEIGH_A4_TEMPLATE;
  await client.query(
    `
    INSERT INTO ${PRINT_TEMPLATES_TABLE} (
      id, code, name, page_width_mm, page_height_mm, background_asset_url, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,now())
    `,
    [tpl.id, tpl.code, tpl.name, tpl.page_width_mm, tpl.page_height_mm, tpl.background_asset_url]
  );

  const prof = SCSC_DEFAULT_PROFILE;
  await client.query(
    `
    INSERT INTO ${PRINT_PROFILES_TABLE} (
      id, template_id, name, offset_x_mm, offset_y_mm, scale_x, scale_y, is_default, notes, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    `,
    [
      prof.id,
      prof.template_id,
      prof.name,
      prof.offset_x_mm,
      prof.offset_y_mm,
      prof.scale_x,
      prof.scale_y,
      prof.is_default,
      prof.notes,
    ]
  );

  let order = 0;
  for (const f of SCSC_WEIGH_DEFAULT_FIELDS) {
    await client.query(
      `
      INSERT INTO ${PRINT_TEMPLATE_FIELDS_TABLE} (
        id, profile_id, field_key, pos_x_mm, pos_y_mm, width_mm, font_size_pt,
        line_height_mm, height_mm, max_lines, align, multiline, bold, sort_order, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()
      )
      `,
      [
        randomUUID(),
        prof.id,
        f.field_key,
        f.pos_x_mm,
        f.pos_y_mm,
        f.width_mm ?? null,
        f.font_size_pt,
        f.line_height_mm ?? null,
        f.height_mm ?? null,
        f.max_lines ?? null,
        f.align ?? "left",
        Boolean(f.multiline),
        Boolean(f.bold),
        order++,
      ]
    );
  }
}

export async function ensurePrintTemplateReady(client) {
  await ensurePrintTemplateSchema(client);
  await seedPrintTemplatesIfEmpty(client);
}

function mapFieldRow(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    fieldKey: row.field_key,
    posXMm: Number(row.pos_x_mm),
    posYMm: Number(row.pos_y_mm),
    widthMm: row.width_mm != null ? Number(row.width_mm) : null,
    fontSizePt: Number(row.font_size_pt),
    lineHeightMm: row.line_height_mm != null ? Number(row.line_height_mm) : null,
    heightMm: row.height_mm != null ? Number(row.height_mm) : null,
    maxLines: row.max_lines != null ? Number(row.max_lines) : null,
    align: row.align,
    multiline: Boolean(row.multiline),
    bold: Boolean(row.bold),
    sortOrder: Number(row.sort_order),
  };
}

function mapProfileRow(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    name: row.name,
    offsetXMm: Number(row.offset_x_mm),
    offsetYMm: Number(row.offset_y_mm),
    scaleX: Number(row.scale_x),
    scaleY: Number(row.scale_y),
    isDefault: Boolean(row.is_default),
    notes: row.notes ?? "",
  };
}

function mapTemplateRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    pageWidthMm: Number(row.page_width_mm),
    pageHeightMm: Number(row.page_height_mm),
    backgroundAssetUrl: row.background_asset_url ?? "",
  };
}

export async function listPrintTemplates(client) {
  const res = await client.query(
    `SELECT * FROM ${PRINT_TEMPLATES_TABLE} ORDER BY code ASC`
  );
  return res.rows.map(mapTemplateRow);
}

export async function listPrintProfiles(client, { templateCode } = {}) {
  let sql = `
    SELECT p.* FROM ${PRINT_PROFILES_TABLE} p
    JOIN ${PRINT_TEMPLATES_TABLE} t ON t.id = p.template_id
  `;
  const params = [];
  if (templateCode) {
    params.push(templateCode);
    sql += ` WHERE t.code = $1`;
  }
  sql += ` ORDER BY p.is_default DESC, p.name ASC`;
  const res = await client.query(sql, params);
  return res.rows.map(mapProfileRow);
}

export async function getPrintProfileById(client, profileId) {
  const res = await client.query(`SELECT * FROM ${PRINT_PROFILES_TABLE} WHERE id = $1`, [profileId]);
  return res.rows[0] ? mapProfileRow(res.rows[0]) : null;
}

export async function getDefaultPrintProfile(client, templateCode) {
  const res = await client.query(
    `
    SELECT p.* FROM ${PRINT_PROFILES_TABLE} p
    JOIN ${PRINT_TEMPLATES_TABLE} t ON t.id = p.template_id
    WHERE t.code = $1
    ORDER BY p.is_default DESC, p.name ASC
    LIMIT 1
    `,
    [templateCode]
  );
  return res.rows[0] ? mapProfileRow(res.rows[0]) : null;
}

export async function getTemplateForProfile(client, profileId) {
  const res = await client.query(
    `
    SELECT t.* FROM ${PRINT_TEMPLATES_TABLE} t
    JOIN ${PRINT_PROFILES_TABLE} p ON p.template_id = t.id
    WHERE p.id = $1
    `,
    [profileId]
  );
  return res.rows[0] ? mapTemplateRow(res.rows[0]) : null;
}

export async function listPrintTemplateFields(client, profileId) {
  const res = await client.query(
    `
    SELECT * FROM ${PRINT_TEMPLATE_FIELDS_TABLE}
    WHERE profile_id = $1
    ORDER BY sort_order ASC, field_key ASC
    `,
    [profileId]
  );
  return res.rows.map(mapFieldRow);
}

/**
 * Bulk replace field coordinates for a profile (editor save).
 * @param {import('pg').PoolClient} client
 * @param {string} profileId
 * @param {Array<object>} fields
 */
export async function replacePrintTemplateFields(client, profileId, fields) {
  await client.query(`DELETE FROM ${PRINT_TEMPLATE_FIELDS_TABLE} WHERE profile_id = $1`, [profileId]);
  let order = 0;
  for (const f of fields) {
    const key = String(f.fieldKey ?? f.field_key ?? "").trim();
    if (!key) continue;
    await client.query(
      `
      INSERT INTO ${PRINT_TEMPLATE_FIELDS_TABLE} (
        id, profile_id, field_key, pos_x_mm, pos_y_mm, width_mm, font_size_pt,
        line_height_mm, height_mm, max_lines, align, multiline, bold, sort_order, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
      `,
      [
        randomUUID(),
        profileId,
        key,
        Number(f.posXMm ?? f.pos_x_mm),
        Number(f.posYMm ?? f.pos_y_mm),
        f.widthMm ?? f.width_mm ?? null,
        Number(f.fontSizePt ?? f.font_size_pt ?? 9),
        f.lineHeightMm ?? f.line_height_mm ?? null,
        f.heightMm ?? f.height_mm ?? null,
        f.maxLines ?? f.max_lines ?? null,
        f.align ?? "left",
        Boolean(f.multiline),
        Boolean(f.bold),
        order++,
      ]
    );
  }
  await client.query(`UPDATE ${PRINT_PROFILES_TABLE} SET updated_at = now() WHERE id = $1`, [profileId]);
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} profileId
 * @param {{ offsetXMm?: number; offsetYMm?: number; scaleX?: number; scaleY?: number }} patch
 */
export async function updatePrintProfileMeta(client, profileId, patch) {
  const sets = [];
  const params = [profileId];
  if (patch.offsetXMm != null) {
    params.push(Number(patch.offsetXMm));
    sets.push(`offset_x_mm = $${params.length}`);
  }
  if (patch.offsetYMm != null) {
    params.push(Number(patch.offsetYMm));
    sets.push(`offset_y_mm = $${params.length}`);
  }
  if (patch.scaleX != null) {
    params.push(Number(patch.scaleX));
    sets.push(`scale_x = $${params.length}`);
  }
  if (patch.scaleY != null) {
    params.push(Number(patch.scaleY));
    sets.push(`scale_y = $${params.length}`);
  }
  if (!sets.length) return;
  sets.push("updated_at = now()");
  await client.query(
    `UPDATE ${PRINT_PROFILES_TABLE} SET ${sets.join(", ")} WHERE id = $1`,
    params
  );
}

export async function loadPrintJobContext(client, { profileId, templateCode = "scsc-weigh-a4" }) {
  let profile = profileId ? await getPrintProfileById(client, profileId) : null;
  if (!profile) profile = await getDefaultPrintProfile(client, templateCode);
  if (!profile) {
    const err = new Error(`Không tìm thấy print profile (template=${templateCode})`);
    err.statusCode = 404;
    throw err;
  }
  const template = await getTemplateForProfile(client, profile.id);
  const fields = await listPrintTemplateFields(client, profile.id);
  return { profile, template, fields };
}
