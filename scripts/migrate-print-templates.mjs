#!/usr/bin/env node
/**
 * Migration print_templates / print_profiles / print_template_fields + seed SCSC A4.
 *
 *   DATABASE_URL=... node scripts/migrate-print-templates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ensurePrintTemplateReady } from "../server/print/printTemplateStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("Thiếu DATABASE_URL.");
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, "..", "server", "migrations", "20260521_print_templates.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.internal") ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query(sql);
    await ensurePrintTemplateReady(client);
    const fields = await client.query(
      `SELECT COUNT(*)::int AS n FROM print_template_fields WHERE profile_id = $1`,
      ["prof-scsc-a4-default"]
    );
    console.info(`[migrate:print-templates] OK — ${fields.rows[0]?.n ?? 0} field SCSC A4 default.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
