/**
 * Xuất danh bạ production → fixtures/ho-so-khach-hang.xlsx (mẫu Hồ sơ KH).
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("fixtures/ho-so-khach-hang.xlsx");
const STATE = process.env.STATE_JSON || path.resolve("output/production-state.json");

async function main() {
  const raw = await readFile(STATE, "utf8");
  const state = JSON.parse(raw);
  const customers = state.customers ?? [];
  const { buildCustomerFullProfileExportWorkbook } = await import(
    "../src/utils/customerFullProfileExcel.ts"
  );
  const wb = await buildCustomerFullProfileExportWorkbook(customers);
  await mkdir(path.dirname(OUT), { recursive: true });
  await wb.xlsx.writeFile(OUT);
  console.log(`Exported ${customers.length} customers → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
