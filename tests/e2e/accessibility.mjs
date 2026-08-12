import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import {
  BASE_URL,
  loginIfConfigured,
} from "./support.mjs";

function formatViolations(violations) {
  return violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(" "))
          .join(", ")})`,
    )
    .join("\n");
}

async function assertNoCritical(page, name, include) {
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  const critical = result.violations.filter((violation) => violation.impact === "critical");
  if (critical.length) {
    throw new Error(`${name} có axe critical:\n${formatViolations(critical)}`);
  }
  console.log(`PASS AXE ${name}: 0 critical (${result.violations.length} non-critical/serious cần theo dõi)`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await loginIfConfigured(context);
  const page = await context.newPage();

  try {
    for (const [route, marker] of [
      ["#/", page.getByRole("button", { name: /\+ Booking/i }).first()],
      ["#/customers", page.getByRole("heading", { name: /Khách hàng/i })],
      ["#/stats", page.getByRole("tablist", { name: "Bộ lọc thống kê" })],
    ]) {
      await page.goto(`${BASE_URL}/${route}`, { waitUntil: "domcontentloaded" });
      await marker.waitFor({ timeout: 15_000 });
      await assertNoCritical(page, route);
    }

    await page.goto(`${BASE_URL}/#/`, { waitUntil: "domcontentloaded" });
    const tools = page.getByRole("button", { name: "Công cụ" }).first();
    await tools.waitFor();
    await tools.click();
    await page.getByRole("menuitem", { name: /Trợ lý AI Ops/i }).click();
    await page.getByRole("dialog", { name: "Trợ lý AI Ops" }).waitFor();
    await assertNoCritical(page, "AI modal", '[role="dialog"][aria-label="Trợ lý AI Ops"]');
    await page.keyboard.press("Escape");
    await page.locator('button[aria-label="Công cụ"]:focus').waitFor();
    console.log("PASS FOCUS AI modal: Escape trả focus về Công cụ");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const mobileHeader = page.getByTestId("ops-mobile-sticky-header");
    await mobileHeader.waitFor();
    const undersized = await mobileHeader.locator("button").evaluateAll((buttons) =>
      buttons.flatMap((button) => {
        const rect = button.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return [];
        return rect.width + 0.5 < 44 || rect.height + 0.5 < 44
          ? [{ label: button.getAttribute("aria-label") || button.textContent, width: rect.width, height: rect.height }]
          : [];
      }),
    );
    if (undersized.length) {
      throw new Error(`Touch target mobile <44px: ${JSON.stringify(undersized)}`);
    }
    console.log("PASS TOUCH: mọi button mobile sticky ≥44×44px");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
