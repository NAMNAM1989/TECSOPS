/** Playwright helpers — trang Verify eCargo (tách khỏi ecargoPlaywright.mjs). */

/** Nút xanh cạnh ô mã — khớp extension Chrome SCSC. */
export function isVerifySubmitLabel(label) {
  const t = String(label || "").trim();
  if (!t || t.length > 32) return false;
  if (!/xác\s*thực/i.test(t)) return false;
  if (/gửi\s*lại|hủy|đóng|quay\s*lại/i.test(t)) return false;
  return /^xác\s*thực\.?!?$/i.test(t) || t.replace(/\s+/g, " ").length <= 16;
}

/** Chờ trang Verify render nút — khớp extension (delay ~1.2s + poll). */
export async function waitForVerifyPageReady(page) {
  await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1_200);
  await page
    .waitForFunction(
      () => {
        const isVerify = (label) => {
          const t = String(label || "").trim();
          if (!t || t.length > 32) return false;
          if (!/xác\s*thực/i.test(t)) return false;
          if (/gửi\s*lại|hủy|đóng|quay\s*lại/i.test(t)) return false;
          return /^xác\s*thực\.?!?$/i.test(t) || t.replace(/\s+/g, " ").length <= 16;
        };
        const nodes = [...document.querySelectorAll("button, input[type='button'], input[type='submit']")];
        return nodes.some((btn) => {
          const label = (btn.innerText || btn.value || btn.textContent || "").trim();
          if (!isVerify(label)) return false;
          const style = window.getComputedStyle(btn);
          const rect = btn.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 1 &&
            rect.height > 1 &&
            !btn.disabled
          );
        });
      },
      { timeout: 25_000 }
    )
    .catch(() => null);
}

/** @returns {Promise<{ clicked: boolean; method?: string; debug?: string }>} */
export async function clickVerifyOnPage(page) {
  await waitForVerifyPageReady(page);

  const roleBtn = page.getByRole("button", { name: /xác\s*thực/i });
  if ((await roleBtn.count()) > 0) {
    try {
      await roleBtn.first().scrollIntoViewIfNeeded();
      await roleBtn.first().click({ timeout: 8_000 });
      return { clicked: true, method: "getByRole" };
    } catch {
      /* thử cách khác */
    }
  }

  const pwLocator = page
    .locator("button, input[type='button'], input[type='submit']")
    .filter({ hasText: /xác\s*thực/i })
    .first();
  try {
    if ((await pwLocator.count()) > 0) {
      await pwLocator.scrollIntoViewIfNeeded();
      await pwLocator.click({ timeout: 8_000, force: true });
      return { clicked: true, method: "locator" };
    }
  } catch {
    /* thử evaluate */
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const evalResult = await page.evaluate(() => {
      const isVerify = (label) => {
        const t = String(label || "").trim();
        if (!t || t.length > 32) return false;
        if (!/xác\s*thực/i.test(t)) return false;
        if (/gửi\s*lại|hủy|đóng|quay\s*lại/i.test(t)) return false;
        return /^xác\s*thực\.?!?$/i.test(t) || t.replace(/\s+/g, " ").length <= 16;
      };
      const nodes = [...document.querySelectorAll("button, input[type='button'], input[type='submit']")];
      const verifyButton = nodes.find((btn) => {
        const label = (btn.innerText || btn.value || btn.textContent || "").trim();
        if (!isVerify(label)) return false;
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width < 1 || rect.height < 1) {
          return false;
        }
        if (btn.disabled) return false;
        return true;
      });
      if (!verifyButton) return { clicked: false };
      verifyButton.scrollIntoView({ block: "center" });
      verifyButton.click();
      return {
        clicked: true,
        label: (verifyButton.innerText || verifyButton.value || "").trim().slice(0, 40),
      };
    });
    if (evalResult?.clicked) {
      return { clicked: true, method: "evaluate", debug: evalResult.label };
    }
    await page.waitForTimeout(80);
  }

  const debug = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("button, input[type='button'], input[type='submit']")]
      .map((b) => (b.innerText || b.value || "").trim())
      .filter(Boolean)
      .slice(0, 12);
    return { title: document.title, url: location.href, buttons: labels };
  });
  return {
    clicked: false,
    debug: JSON.stringify(debug).slice(0, 400),
  };
}

/** Chờ trang Details sau khi bấm Xác Thực. */
export async function waitForVerifySuccessPage(page) {
  await page
    .waitForURL(/\/Export\/VCTOrder\/Details\//i, { timeout: 45_000 })
    .catch(() => null);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const href = location.href;
      const onDetails = /\/Export\/VCTOrder\/Details\//i.test(href);
      const bannerOk = /Phiếu đăng ký đã được xác thực thành công/i.test(text);
      const detailsPage =
        /Thông tin hàng vào kho/i.test(text) &&
        (/Số đăng ký/i.test(text) || /Trạng thái/i.test(text));
      const success =
        bannerOk || onDetails || detailsPage || (onDetails && /đã được xác thực/i.test(text));
      const failure =
        (/không\s*hợp\s*lệ|thất\s*bại|hết\s*hạn|invalid|không\s*tìm\s*thấy/i.test(text) &&
          !success) ||
        false;
      const regMatch =
        href.match(/\/Details\/([A-Z0-9]{6,12})/i) ||
        text.match(/Số đăng ký\s*:?\s*([A-Z0-9]{6,12})/i);
      return {
        success,
        failure,
        onDetails,
        registrationNo: regMatch ? regMatch[1].toUpperCase() : "",
        detailsUrl: onDetails ? href : "",
        text: text.slice(0, 320),
      };
    });
    if (snap.success) return { ...snap, success: true };
    if (snap.failure) return { ...snap, failure: true };
    await page.waitForTimeout(300);
  }

  return page.evaluate(() => ({
    success: false,
    failure: false,
    text: (document.body?.innerText || "").slice(0, 320),
    detailsUrl: location.href,
  }));
}
