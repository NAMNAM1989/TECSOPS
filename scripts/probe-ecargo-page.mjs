import "../server/loadEnv.mjs";
import { chromium } from "playwright";
import { ECARGO_CREATE_URL } from "../server/ecargo/ecargoConfig.mjs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(ECARGO_CREATE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

for (const delay of [0, 500, 1000, 2000, 3000, 5000]) {
  if (delay) await page.waitForTimeout(delay);
  const info = await page.evaluate((d) => {
    const vis = (sel) =>
      [...document.querySelectorAll(sel)].filter((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && r.width > 0 && r.height > 0;
      }).length;
    return {
      delay: d,
      title: document.title,
      inputs: vis("input"),
      textareas: vis("textarea"),
      buttons: vis("button"),
      bodyLen: document.body?.innerText?.length ?? 0,
    };
  }, delay);
  console.log(info);
}

await browser.close();
