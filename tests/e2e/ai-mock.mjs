import { chromium } from "playwright";
import {
  BASE_URL,
  loginIfConfigured,
  readJson,
} from "./support.mjs";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await loginIfConfigured(context);
  const initialState = await readJson(await context.request.get(`${BASE_URL}/api/state`));
  const page = await context.newPage();
  let mutationCount = 0;

  await page.route("**/api/ai/parse-booking-text", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ok: true,
        model: "e2e-mock",
        result: {
          awb: "000-12345678",
          hawb: "",
          flight: "E2E01",
          flightDate: "12AUG",
          cutoff: "",
          dest: "TST",
          warehouse: "TECS-TCS",
          pcs: 1,
          kg: 1,
          customer: "",
          note: "AI E2E MOCK",
          confidence: 1,
          warnings: [],
        },
      }),
    });
  });
  await page.route("**/api/ai/events", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ ok: true, recorded: true }),
    });
  });

  await page.route("**/api/mutation", async (route) => {
    const payload = route.request().postDataJSON();
    if (payload?.action !== "ADD") {
      await route.fulfill({ status: 400, body: JSON.stringify({ error: "Expected ADD" }) });
      return;
    }
    mutationCount += 1;
    const row = {
      ...payload.shipment,
      id: "e2e-ai-mock",
      stt: initialState.rows.length + 1,
    };
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ...initialState,
        version: initialState.version + 1,
        rows: [...initialState.rows, row],
      }),
    });
  });

  try {
    await page.goto(`${BASE_URL}/#/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Công cụ" }).first().click();
    await page.getByRole("menuitem", { name: /Trợ lý AI Ops/i }).click();
    await page.getByRole("dialog", { name: "Trợ lý AI Ops" }).waitFor();
    await page.getByRole("textbox", { name: /Đầu vào Tin → Booking/i }).fill(
      "000-12345678 E2E01 TST 1pcs 1kg",
    );
    await page.getByRole("button", { name: "Tạo draft" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("input")).some(
        (input) => input.value === "000-12345678",
      ),
    );
    await page.getByRole("button", { name: "Xác nhận tạo booking" }).click();
    await page.getByText(/Đã tạo đúng 1 booking từ draft AI/i).waitFor();
    if (mutationCount !== 1) {
      throw new Error(`Confirm phải gọi mutation đúng 1 lần, thực tế ${mutationCount}`);
    }
    console.log("PASS AI mock: preview → Confirm → 1 mutation; Gemini/DB không bị gọi.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
