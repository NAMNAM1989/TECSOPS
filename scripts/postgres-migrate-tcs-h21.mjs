#!/usr/bin/env node
/**
 * Ensure + seed bảng tcs_h21_goods / tcs_h21_stamp_ids (kho TCS).
 *
 *   DATABASE_URL=... node scripts/postgres-migrate-tcs-h21.mjs
 */
import {
  ensureTcsH21CatalogSchema,
  listTcsH21Goods,
  seedTcsH21CatalogIfEmpty,
} from "../server/tcsH21Catalog.mjs";
import { withDbClient, isDatabaseConfigured } from "../server/dbPool.mjs";

async function main() {
  if (!isDatabaseConfigured()) {
    console.error("Thiếu DATABASE_URL.");
    process.exit(1);
  }
  const result = await withDbClient(async (client) => {
    await ensureTcsH21CatalogSchema(client);
    const seeded = await seedTcsH21CatalogIfEmpty(client);
    const items = await listTcsH21Goods(client, { activeOnly: false, limit: 2000 });
    return { ...seeded, total: items.length };
  });
  console.log(JSON.stringify({ ok: true, warehouseScope: "TCS", ...result }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
