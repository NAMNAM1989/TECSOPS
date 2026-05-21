/**
 * Đo thời gian từng pha eCargo (Playwright goto + Gmail poll).
 * Chạy: node scripts/benchmark-ecargo-timing.mjs
 */
import "../server/loadEnv.mjs";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { ECARGO_CREATE_URL } from "../server/ecargo/ecargoConfig.mjs";

function ms(t0) {
  return `${Math.round(performance.now() - t0)}ms`;
}

async function benchGoto(label, waitUntil) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const t0 = performance.now();
  try {
    await page.goto(ECARGO_CREATE_URL, { waitUntil, timeout: 60_000 });
    const afterGoto = performance.now();
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll("input")].some((el) => {
            if (el.type === "hidden" || el.type === "radio" || el.type === "checkbox") return false;
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.display !== "none" && r.width > 0 && r.height > 0;
          }),
        { timeout: 20_000 }
      )
      .catch(() => null);
    const afterInput = performance.now();
    console.log(
      `${label}: goto=${Math.round(afterGoto - t0)}ms, +form=${Math.round(afterInput - afterGoto)}ms, total=${Math.round(afterInput - t0)}ms`
    );
  } catch (e) {
    console.log(`${label}: FAIL ${e.message} (${ms(t0)})`);
  } finally {
    await browser.close();
  }
}

async function benchGmailConnect() {
  const appPassword = process.env.ECARGO_GMAIL_APP_PASSWORD?.trim();
  if (!appPassword) {
    console.log("Gmail: SKIP — thiếu ECARGO_GMAIL_APP_PASSWORD");
    return;
  }
  const { ImapFlow } = await import("imapflow");
  const t0 = performance.now();
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.ECARGO_GMAIL_USER || "namnamlog.work@gmail.com", pass: appPassword },
    logger: false,
  });
  try {
    await client.connect();
    console.log(`Gmail connect: ${ms(t0)}`);
    const t1 = performance.now();
    await client.mailboxOpen("INBOX");
    console.log(`Gmail open INBOX: ${ms(t1)}`);
    const t2 = performance.now();
    await client.search({ from: "ecargo@scsc.vn", since: new Date(Date.now() - 86400000) });
    console.log(`Gmail search: ${ms(t2)}`);
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
  console.log(`Gmail full cycle: ${ms(t0)}`);
}

console.info("=== eCargo timing benchmark ===\n");
await benchGoto("networkidle", "networkidle");
await benchGoto("domcontentloaded", "domcontentloaded");
await benchGoto("load", "load");
console.log("");
await benchGmailConnect();
