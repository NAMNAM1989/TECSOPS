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
const pro = path.join(root, "pro.html");
const newC = path.join(root, "new-c.html");
const newD = path.join(root, "new-d.html");
const newE = path.join(root, "new-e.html");
const newF = path.join(root, "new-f.html");
const newG = path.join(root, "new-g.html");
const newH = path.join(root, "new-h.html");
const newI = path.join(root, "new-i.html");
const newJ = path.join(root, "new-j.html");
const newK = path.join(root, "new-k.html");
const newL = path.join(root, "new-l.html");
const newM = path.join(root, "new-m.html");
const newN = path.join(root, "new-n.html");

const browser = await chromium.launch();

async function shot(file, viewport, dest) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const href = file.startsWith("file:") ? file : `file://${file}`;
  await page.goto(href, { waitUntil: "networkidle" });
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
await shot(improved, { width: 1440, height: 900 }, path.join(outDir, "mockup-desktop-actions.png"));
await shot(improved, { width: 390, height: 844 }, path.join(outDir, "mockup-mobile-actions.png"));
await shot(`${improved}?sheet=1`, { width: 390, height: 844 }, path.join(outDir, "mockup-mobile-actions-sheet.png"));
await shot(`${pro}?dir=a`, { width: 1440, height: 900 }, path.join(outDir, "pro-A-desktop.png"));
await shot(`${pro}?dir=a`, { width: 390, height: 844 }, path.join(outDir, "pro-A-mobile.png"));
await shot(`${pro}?dir=b`, { width: 1440, height: 900 }, path.join(outDir, "pro-B-desktop.png"));
await shot(`${pro}?dir=b`, { width: 390, height: 844 }, path.join(outDir, "pro-B-mobile.png"));
await shot(newC, { width: 1440, height: 900 }, path.join(outDir, "new-C-desktop.png"));
await shot(newC, { width: 390, height: 844 }, path.join(outDir, "new-C-mobile.png"));
await shot(newD, { width: 1440, height: 900 }, path.join(outDir, "new-D-desktop.png"));
await shot(newD, { width: 390, height: 844 }, path.join(outDir, "new-D-mobile.png"));
await shot(newE, { width: 1440, height: 900 }, path.join(outDir, "new-E-desktop.png"));
await shot(newE, { width: 390, height: 844 }, path.join(outDir, "new-E-mobile.png"));
await shot(newF, { width: 1440, height: 900 }, path.join(outDir, "new-F-desktop.png"));
await shot(newF, { width: 390, height: 844 }, path.join(outDir, "new-F-mobile.png"));
await shot(newG, { width: 1440, height: 900 }, path.join(outDir, "new-G-desktop.png"));
await shot(newG, { width: 390, height: 844 }, path.join(outDir, "new-G-mobile.png"));
await shot(newH, { width: 1440, height: 900 }, path.join(outDir, "new-H-desktop.png"));
await shot(newH, { width: 390, height: 844 }, path.join(outDir, "new-H-mobile.png"));
await shot(newI, { width: 1440, height: 900 }, path.join(outDir, "new-I-grid.png"));
await shot(`${newI}?focus=1`, { width: 1440, height: 900 }, path.join(outDir, "new-I-detail.png"));
await shot(newI, { width: 390, height: 844 }, path.join(outDir, "new-I-mobile.png"));
await shot(`${newI}?sheet=1`, { width: 390, height: 844 }, path.join(outDir, "new-I-mobile-detail.png"));
await shot(newJ, { width: 1440, height: 900 }, path.join(outDir, "new-J-desktop.png"));
await shot(newJ, { width: 390, height: 844 }, path.join(outDir, "new-J-mobile.png"));
await shot(newK, { width: 1440, height: 900 }, path.join(outDir, "new-K-desktop.png"));
await shot(newK, { width: 390, height: 844 }, path.join(outDir, "new-K-mobile.png"));
await shot(newL, { width: 1440, height: 900 }, path.join(outDir, "new-L-desktop.png"));
await shot(newL, { width: 390, height: 844 }, path.join(outDir, "new-L-mobile.png"));
await shot(newM, { width: 1440, height: 900 }, path.join(outDir, "new-M-desktop.png"));
await shot(newM, { width: 390, height: 844 }, path.join(outDir, "new-M-mobile.png"));
await shot(`${newM}?detail=1`, { width: 1440, height: 900 }, path.join(outDir, "new-M-detail.png"));
await shot(newN, { width: 1440, height: 900 }, path.join(outDir, "new-N-desktop.png"));
await shot(newN, { width: 390, height: 844 }, path.join(outDir, "new-N-mobile.png"));

await browser.close();
