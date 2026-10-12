/**
 * Render mockup PNGs. Dev-only helper — not wired into CI.
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const current = path.join(root, "current.html");
const improved = path.join(root, "index.html");

const browser = await chromium.launch();

async function shot(file, viewport, dest) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`file://${file}`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: dest, fullPage: false });
  await page.close();
  console.log("wrote", dest);
}

await shot(current, { width: 1440, height: 900 }, path.join(outDir, "current-desktop.png"));
await shot(improved, { width: 1440, height: 900 }, path.join(outDir, "mockup-desktop-info-kh.png"));
await shot(improved, { width: 390, height: 844 }, path.join(outDir, "mockup-mobile-info-kh.png"));
await shot(`${improved}?sheet=1`, { width: 390, height: 844 }, path.join(outDir, "mockup-mobile-info-sheet.png"));

await browser.close();
