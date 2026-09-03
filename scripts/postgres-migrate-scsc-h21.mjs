#!/usr/bin/env node
/**
 * Ensure + seed bảng scsc_h21_goods / scsc_h21_stamp_ids (kho SCSC).
 *
 *   DATABASE_URL=... node scripts/postgres-migrate-scsc-h21.mjs
 */
import {
  ensureScscH21CatalogSchema,
  listScscH21Goods,
  seedScscH21CatalogIfEmpty,
} from "../server/scscH21Catalog.mjs";
import { withDbClient, isDatabaseConfigured } from "../server/dbPool.mjs";

async function main() {
  if (!isDatabaseConfigured()) {
    console.error("Thiếu DATABASE_URL.");
    process.exit(1);
  }
  const result = await withDbClient(async (client) => {
    await ensureScscH21CatalogSchema(client);
    const seeded = await seedScscH21CatalogIfEmpty(client);
    const items = await listScscH21Goods(client, { activeOnly: false, limit: 2000 });
    return { ...seeded, total: items.length };
  });
  console.log(JSON.stringify({ ok: true, warehouseScope: "SCSC", ...result }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
