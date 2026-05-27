import { chromium } from "playwright";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--font-render-hinting=none", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

/**
 * Render PDF A4 từ HTML export template.
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export async function renderInvoicePdfFromHtml(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closeInvoicePdfBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
}
