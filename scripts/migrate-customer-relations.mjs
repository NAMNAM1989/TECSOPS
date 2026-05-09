#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

function makePool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.internal") ? false : { rejectUnauthorized: false },
    max: 3,
  });
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Thiếu DATABASE_URL.");
  }
  const pool = makePool(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["tecsops:customer-migration"]);

    // Ưu tiên map theo customer_code.
    const byCode = await client.query(
      `
      UPDATE shipments s
      SET customer_id = c.id
      FROM customers c
      WHERE (s.customer_id IS NULL OR s.customer_id = '')
        AND s.customer_code <> ''
        AND lower(c.code) = lower(s.customer_code)
      `
    );

    // Fallback map theo customer name -> customer.name.
    const byName = await client.query(
      `
      UPDATE shipments s
      SET customer_id = c.id
      FROM customers c
      WHERE (s.customer_id IS NULL OR s.customer_id = '')
        AND s.customer <> ''
        AND lower(c.name) = lower(s.customer)
      `
    );

    // Fallback map theo customer text -> customer.code.
    const byCustomerAsCode = await client.query(
      `
      UPDATE shipments s
      SET customer_id = c.id
      FROM customers c
      WHERE (s.customer_id IS NULL OR s.customer_id = '')
        AND s.customer <> ''
        AND lower(c.code) = lower(s.customer)
      `
    );

    // Đồng bộ customer_code nếu đã map id nhưng code đang rỗng.
    await client.query(
      `
      UPDATE shipments s
      SET customer_code = c.code
      FROM customers c
      WHERE s.customer_id = c.id
        AND coalesce(s.customer_code, '') = ''
      `
    );

    const mismatchRes = await client.query(
      `
      SELECT id, awb, customer, customer_code, session_date, warehouse
      FROM shipments
      WHERE customer <> '' AND (customer_id IS NULL OR customer_id = '')
      ORDER BY session_date, warehouse, stt, id
      `
    );

    await client.query("COMMIT");

    const mismatches = mismatchRes.rows;
    const reportDir = path.resolve(process.cwd(), "tmp");
    fs.mkdirSync(reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportDir, `customer-migration-mismatch-${stamp}.csv`);
    const lines = [
      "id,awb,customer,customer_code,session_date,warehouse",
      ...mismatches.map((r) =>
        [
          csvEscape(r.id),
          csvEscape(r.awb),
          csvEscape(r.customer),
          csvEscape(r.customer_code),
          csvEscape(r.session_date),
          csvEscape(r.warehouse),
        ].join(",")
      ),
    ];
    fs.writeFileSync(reportPath, lines.join("\n"), "utf8");

    console.info("[migrate-customer-relations] Done.");
    console.info(`  Matched by code: ${byCode.rowCount}`);
    console.info(`  Matched by name: ${byName.rowCount}`);
    console.info(`  Matched by customer-as-code: ${byCustomerAsCode.rowCount}`);
    console.info(`  Unmatched rows: ${mismatches.length}`);
    console.info(`  Mismatch report: ${reportPath}`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[migrate-customer-relations]", e.message || e);
  process.exit(1);
});
