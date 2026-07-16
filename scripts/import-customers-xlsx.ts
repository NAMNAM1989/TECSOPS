/**
 * Import danh bạ từ Excel (mẫu Import Customers 9 cột) vào Postgres.
 *
 *   npx tsx scripts/import-customers-xlsx.ts [path.xlsx]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../server/loadEnv.mjs";
import { createPostgresStateStore } from "../server/postgresStateStore.mjs";
import {
  loadState,
  saveState,
  setPostgresStateStore,
  applyMutation,
} from "../server/stateStore.mjs";
import {
  applyCustomsOpsImport,
  parseCustomsOpsWorkbook,
} from "../src/utils/customerCustomsOpsExcel.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const candidates = [
  process.argv[2],
  "e:/customer-import-template.xlsx",
  path.join(root, "public/templates/customer/customs_ops.xlsx"),
].filter(Boolean) as string[];

const filePath = candidates.find((p) => fs.existsSync(p));
if (!filePath) {
  console.error("[import-customers] Không tìm thấy file Excel.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[import-customers] Thiếu DATABASE_URL.");
  process.exit(1);
}

setPostgresStateStore(createPostgresStateStore(databaseUrl));

const buf = fs.readFileSync(filePath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const rows = await parseCustomsOpsWorkbook(ab);
const current = await loadState();
const result = applyCustomsOpsImport(current.customers ?? [], rows);
const next = applyMutation(current, {
  action: "SET_CUSTOMERS",
  customers: result.customers,
});
await saveState(next);

console.info(
  `[import-customers] ${path.basename(filePath)} → tạo ${result.created}, cập nhật ${result.updated}, bỏ ${result.skipped}, lỗi ${result.errors.length}; tổng khách=${next.customers.length}`
);
if (result.errors.length) {
  for (const e of result.errors.slice(0, 8)) {
    console.warn(`  dòng ${e.rowNumber}: ${e.message}`);
  }
}
