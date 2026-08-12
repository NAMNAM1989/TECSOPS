import { chromium } from "playwright";
import {
  BASE_URL,
  assertMutationAllowed,
  isE2eMarker,
  loginIfConfigured,
  readJson,
} from "../tests/e2e/support.mjs";

async function main() {
  assertMutationAllowed();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    await loginIfConfigured(context);
    const state = await readJson(await context.request.get(`${BASE_URL}/api/state`));
    const rows = (state.rows || []).filter((row) => isE2eMarker(row.note));
    if (!rows.length) {
      console.log("E2E cleanup: không có shipment marker hợp lệ.");
      return;
    }
    for (const row of rows) {
      const marker = String(row.note || "").trim();
      if (!isE2eMarker(marker)) {
        throw new Error(`Từ chối xóa ${row.id}: marker không hợp lệ`);
      }
      await readJson(
        await context.request.post(`${BASE_URL}/api/mutation`, {
          data: { action: "DELETE", id: row.id },
        }),
      );
      console.log(`CLEANUP ${row.id} · ${marker}`);
    }
    console.log(`E2E cleanup: đã xóa ${rows.length} shipment đúng marker.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
