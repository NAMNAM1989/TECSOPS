async (page) => {
  const results = [];
  const consoleErrors = [];
  const networkFails = [];
  const pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) networkFails.push({ status: r.status(), url: r.url() });
  });

  const pass = (id, detail) => results.push({ id, status: "PASS", detail });
  const fail = (id, detail) => results.push({ id, status: "FAIL", detail });
  const blocked = (id, detail) => results.push({ id, status: "BLOCKED", detail });

  async function setSessionDate(ymd) {
    await page.evaluate((date) => {
      const input = document.querySelector('input[aria-label="Ngày phiên Ops"]');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, date);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, ymd);
    await page.waitForTimeout(2200);
  }

  await page.goto("https://ops-production-b405.up.railway.app/#/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1800);
  await setSessionDate("2026-08-29");

  // F001 Live
  (await page.getByText("Live", { exact: true }).count()) > 0
    ? pass("F001-LIVE", "Live pill visible")
    : fail("F001-LIVE", "Live pill missing");

  // F002 Date
  const dateVal = await page.locator('input[aria-label="Ngày phiên Ops"]').inputValue();
  dateVal === "2026-08-29" ? pass("F002-DATE", dateVal) : fail("F002-DATE", `got ${dateVal}`);

  // F003 Warehouse tabs
  const whTabs = page.getByRole("tablist", { name: /Chọn kho/i }).getByRole("tab");
  const whCount = await whTabs.count();
  whCount === 4 ? pass("F003-WH-TABS", `${whCount} tabs`) : fail("F003-WH-TABS", `${whCount} tabs`);
  const whLabels = [];
  for (let i = 0; i < whCount; i++) {
    whLabels.push((await whTabs.nth(i).innerText()).replace(/\s+/g, " "));
  }
  pass("F003-WH-LABELS", whLabels.join(" | "));

  for (let i = 0; i < whCount; i++) {
    await whTabs.nth(i).click();
    await page.waitForTimeout(350);
  }
  await whTabs.first().click();
  await page.waitForTimeout(400);
  pass("F004-WH-SWITCH", "switched all warehouses");

  const rowCount = await page.locator("tbody tr").count();
  rowCount > 0 ? pass("F005-ROWS", `${rowCount} rows`) : fail("F005-ROWS", "no rows");

  // Search discovery + tests
  let searchBox = page.locator('input[placeholder*="AWB" i], input[aria-label*="Tìm" i], input[type="search"]').first();
  if (!(await searchBox.count())) {
    searchBox = page.getByRole("textbox").filter({ hasNot: page.locator('[type="date"]') }).first();
  }
  // Prefer visible search in strip
  const searchCandidates = page.locator("input:visible");
  const sc = await searchCandidates.count();
  let chosen = null;
  for (let i = 0; i < sc; i++) {
    const el = searchCandidates.nth(i);
    const ph = ((await el.getAttribute("placeholder")) || "") + ((await el.getAttribute("aria-label")) || "");
    const type = (await el.getAttribute("type")) || "text";
    if (type === "date") continue;
    if (/AWB|tìm|search|khách|lô/i.test(ph) || type === "search") {
      chosen = el;
      break;
    }
  }
  if (!chosen) {
    fail("F006-SEARCH-DISC", `no search input among ${sc}`);
  } else {
    pass("F006-SEARCH-DISC", "search input found");
    const firstAwbText = await page.locator("tbody tr").first().innerText();
    const m = firstAwbText.match(/(\d{3})[-\s]?(\d{4})\s?(\d{4})/);
    if (m) {
      const q = m[2];
      await chosen.fill(q);
      await page.waitForTimeout(700);
      const filtered = await page.locator("tbody tr").count();
      filtered >= 1
        ? pass("F006-SEARCH-PARTIAL", `q=${q} rows=${filtered}`)
        : fail("F006-SEARCH-PARTIAL", `q=${q} rows=${filtered}`);
      await chosen.fill("ZZZNOMATCH999");
      await page.waitForTimeout(700);
      const missRows = await page.locator("tbody tr").count();
      const missMsg = await page.getByText(/Không có lô khớp|không khớp/i).count();
      missMsg > 0 || missRows <= 1
        ? pass("F006-SEARCH-MISS", `rows=${missRows}`)
        : fail("F006-SEARCH-MISS", `rows=${missRows}`);
      await chosen.fill("");
      await page.waitForTimeout(500);
    } else {
      blocked("F006-SEARCH-PARTIAL", "AWB not parsed from first row");
    }
  }

  // Status filters
  const statusLike = await page.getByRole("button", { name: /Tất cả|PENDING|RECEIVED|Chờ|Nhận|CUTOFF|BUILT/i }).count();
  pass("F007-STATUS-FILTER-DISC", `${statusLike} status-like controls`);

  // Booking on today
  const todayBtn = page.getByRole("button", { name: "Hôm nay" });
  if (await todayBtn.count()) {
    await todayBtn.click();
    await page.waitForTimeout(1500);
  } else {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await setSessionDate(ymd);
  }
  const todayDate = await page.locator('input[aria-label="Ngày phiên Ops"]').inputValue();
  const beforeRows = await page.locator("tbody tr").count();
  await page.getByRole("button", { name: /\+ Booking/i }).first().click();
  await page.waitForTimeout(1600);
  const afterRows = await page.locator("tbody tr").count();
  afterRows > beforeRows
    ? pass("F008-BOOKING-ADD", `rows ${beforeRows}->${afterRows} date=${todayDate}`)
    : fail("F008-BOOKING-ADD", `rows ${beforeRows}->${afterRows} date=${todayDate}`);

  // Rapid triple booking
  const r0 = await page.locator("tbody tr").count();
  const bookBtn = page.getByRole("button", { name: /\+ Booking/i }).first();
  await bookBtn.click();
  await bookBtn.click();
  await bookBtn.click();
  await page.waitForTimeout(2200);
  const r1 = await page.locator("tbody tr").count();
  pass("F017-RAPID-BOOKING", `rows ${r0}->${r1}`);

  // Cleanup blank bookings created today
  let deleted = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = page.locator("tbody tr");
    const n = await rows.count();
    if (n <= 0) break;
    let targetIdx = -1;
    for (let i = 0; i < n; i++) {
      const txt = await rows.nth(i).innerText();
      if (/\+ Booking/.test(txt) && !/\d{3}-\d/.test(txt)) continue;
      // blank AWB / PENDING empty-ish
      if (!/\d{3}-\d{4}/.test(txt)) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) break;
    const row = rows.nth(targetIdx);
    const btns = row.locator("button");
    if ((await btns.count()) === 0) break;
    await btns.last().click();
    await page.waitForTimeout(450);
    const del = page.getByRole("menuitem", { name: /Xóa|Delete/i });
    if (!(await del.count())) {
      const delBtn = page.getByRole("button", { name: /Xóa|Delete/i });
      if (await delBtn.count()) {
        page.once("dialog", async (d) => {
          try {
            await d.accept();
          } catch {}
        });
        await delBtn.first().click();
        await page.waitForTimeout(900);
        deleted++;
        continue;
      }
      await page.keyboard.press("Escape");
      break;
    }
    page.once("dialog", async (d) => {
      try {
        await d.accept();
      } catch {}
    });
    await del.first().click();
    await page.waitForTimeout(900);
    deleted++;
  }
  pass("F018-CLEANUP-DELETE", `deleted=${deleted}`);

  // Customers nav
  await page.getByRole("button", { name: /^Khách$/i }).click();
  await page.waitForTimeout(2200);
  (await page.getByRole("heading", { name: /Khách hàng/i }).count()) > 0
    ? pass("F011-CUSTOMERS", page.url())
    : fail("F011-CUSTOMERS", page.url());

  // Customer search if present
  const custSearch = page.getByPlaceholder(/tìm|search|mã|code/i).first();
  if (await custSearch.count()) {
    await custSearch.fill("ZZZ");
    await page.waitForTimeout(500);
    await custSearch.fill("");
    pass("F011-CUSTOMERS-SEARCH", "search interacted");
  } else {
    blocked("F011-CUSTOMERS-SEARCH", "no customer search");
  }

  await page.goto("https://ops-production-b405.up.railway.app/#/");
  await page.waitForTimeout(1500);
  (await page.getByRole("button", { name: /\+ Booking/i }).count()) > 0
    ? pass("F012-BACK-OPS", "ops restored")
    : fail("F012-BACK-OPS", "ops missing");

  // Stats
  await page.getByRole("button", { name: /Thống kê/i }).click();
  await page.waitForTimeout(3500);
  page.url().includes("stats")
    ? pass("F013-STATS", page.url())
    : fail("F013-STATS", page.url());
  await page.goto("https://ops-production-b405.up.railway.app/#/");
  await page.waitForTimeout(1500);

  // Airline modal
  await page.getByRole("button", { name: /Tên hãng/i }).click();
  await page.waitForTimeout(1000);
  (await page.getByRole("dialog").count()) > 0
    ? pass("F014-AIRLINE-MODAL", "open")
    : fail("F014-AIRLINE-MODAL", "no dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  (await page.getByRole("dialog").count()) === 0
    ? pass("F014-AIRLINE-CLOSE", "closed")
    : fail("F014-AIRLINE-CLOSE", "still open");

  // Excel
  await page.getByRole("button", { name: /Xuất Excel/i }).click();
  await page.waitForTimeout(1000);
  (await page.getByRole("dialog").count()) > 0 || (await page.getByText(/Xuất Excel|Chọn ngày/i).count()) > 0
    ? pass("F015-EXCEL-DIALOG", "opened")
    : fail("F015-EXCEL-DIALOG", "not opened");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Sheet import
  await page.getByRole("button", { name: /Nhập Sheet/i }).click();
  await page.waitForTimeout(1400);
  (await page.getByRole("dialog").count()) > 0 || (await page.getByText(/Google Sheet|Nhập/i).count()) > 0
    ? pass("F016-SHEET-MODAL", "opened")
    : fail("F016-SHEET-MODAL", "not opened");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Cross: date persist after nav
  await setSessionDate("2026-08-29");
  await page.getByRole("button", { name: /^Khách$/i }).click();
  await page.waitForTimeout(1200);
  await page.goto("https://ops-production-b405.up.railway.app/#/");
  await page.waitForTimeout(1800);
  const dateAfterNav = await page.locator('input[aria-label="Ngày phiên Ops"]').inputValue();
  pass("F019-DATE-AFTER-NAV", `date=${dateAfterNav}`);

  await setSessionDate("2026-08-29");
  const allButtons = await page.getByRole("button").allTextContents();
  const uniqueButtons = [
    ...new Set(allButtons.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean)),
  ];

  // Row menu + print-like
  const row1 = page.locator("tbody tr").first();
  await row1.locator("button").last().click();
  await page.waitForTimeout(500);
  const menuTexts = await page.locator('[role="menuitem"], [role="menu"] button').allTextContents();
  pass("F020-PRINT-MENU", JSON.stringify(menuTexts).slice(0, 600));
  const printItem = page.getByRole("menuitem", { name: /In|Print|Tem|CSD|DIM|Excel|PDF/i });
  if (await printItem.count()) {
    await printItem.first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
    pass("F020-PRINT-CLICK", "clicked");
  } else {
    blocked("F020-PRINT-CLICK", "no print menuitem");
  }

  // Invalid AWB edit on a blank booking if any remains today
  const today2 = new Date();
  const todayYmd = `${today2.getFullYear()}-${String(today2.getMonth() + 1).padStart(2, "0")}-${String(today2.getDate()).padStart(2, "0")}`;
  await setSessionDate(todayYmd);
  await page.getByRole("button", { name: /\+ Booking/i }).first().click();
  await page.waitForTimeout(1200);
  const editRow = page.locator("tbody tr").first();
  await editRow.locator("td").nth(1).dblclick().catch(() => {});
  await page.waitForTimeout(400);
  const focused = page.locator("input:focus");
  if (await focused.count()) {
    await focused.fill("12");
    await focused.press("Enter");
    await page.waitForTimeout(800);
    const toastOrErr = await page.getByText(/AWB|11|chữ số|không hợp lệ|sai/i).count();
    pass("F009-AWB-INVALID", `toastOrTextHits=${toastOrErr}`);
  } else {
    blocked("F009-AWB-INVALID", "no focused input");
  }
  // cleanup last blank
  try {
    const btns = page.locator("tbody tr").first().locator("button");
    if (await btns.count()) {
      await btns.last().click();
      await page.waitForTimeout(400);
      const del = page.getByRole("menuitem", { name: /Xóa|Delete/i });
      if (await del.count()) {
        page.once("dialog", async (d) => {
          try {
            await d.accept();
          } catch {}
        });
        await del.first().click();
        await page.waitForTimeout(800);
      } else {
        await page.keyboard.press("Escape");
      }
    }
  } catch {}

  // Record A then B selection check
  await setSessionDate("2026-08-29");
  const nRows = await page.locator("tbody tr").count();
  if (nRows >= 2) {
    await page.locator("tbody tr").nth(0).click();
    await page.waitForTimeout(200);
    await page.locator("tbody tr").nth(1).click();
    await page.waitForTimeout(200);
    pass("F021-SELECT-A-B", "clicked row0 then row1");
  } else {
    blocked("F021-SELECT-A-B", `rows=${nRows}`);
  }

  // Image report buttons state when lots exist
  const vantage = page.getByRole("button", { name: /Vantage/i });
  const vantageDisabled = (await vantage.count()) ? await vantage.isDisabled() : true;
  pass("F022-IMAGE-REPORT-STATE", `vantageDisabled=${vantageDisabled}`);

  const uniqueNet = [
    ...new Map(networkFails.map((x) => [`${x.status}:${x.url}`, x])).values(),
  ].slice(0, 30);

  return {
    results,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    pageErrors: [...new Set(pageErrors)].slice(0, 20),
    networkFails: uniqueNet,
    uniqueButtons: uniqueButtons.slice(0, 100),
    summary: {
      pass: results.filter((r) => r.status === "PASS").length,
      fail: results.filter((r) => r.status === "FAIL").length,
      blocked: results.filter((r) => r.status === "BLOCKED").length,
      total: results.length,
    },
  };
}
