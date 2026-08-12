import { chromium } from "playwright";
import {
  BASE_URL,
  assertMutationAllowed,
  isE2eMarker,
  loginIfConfigured,
  readJson,
} from "./support.mjs";

const timestamp = Date.now();
const marker = `E2E-G1-${timestamp}`;
const sessionDate =
  process.env.E2E_SESSION_DATE || new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const awbDigits = `000${String(timestamp).slice(-8)}`;
const awbVisible = `${awbDigits.slice(0, 3)}-${awbDigits.slice(3, 7)} ${awbDigits.slice(7)}`;

function shipmentDraft() {
  return {
    sessionDate,
    awb: awbDigits,
    hawb: "",
    flight: "E2E01",
    flightDate: "",
    cutoff: "",
    cutoffNote: "",
    note: marker,
    dest: "TST",
    warehouse: "TECS-TCS",
    pcs: 1,
    kg: 1,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "",
    customerCode: "",
    customerId: "",
    globalAgentId: "",
    customerShipperId: "",
    customerConsigneeId: "",
    customerGoodsId: "",
    goodsDescriptionPrint: "",
    otherRequirementsPrint: "",
    shipperNamePrint: "",
    shipperAddressPrint: "",
    shipperPhonePrint: "",
    shipperEmailPrint: "",
    taxCodePrint: "",
    agentNamePrint: "",
    agentAddressPrint: "",
    agentPhonePrint: "",
    agentEmailPrint: "",
    agentTaxCodePrint: "",
    consigneeNamePrint: "",
    consigneeAddressPrint: "",
    consigneePhonePrint: "",
    consigneeEmailPrint: "",
    notifyNamePrint: "",
    status: "PENDING",
  };
}

async function selectSessionAndSearch(page) {
  const date = page.locator('input[type="date"]').first();
  await date.fill(sessionDate);
  const search = page.getByRole("combobox", { name: /Tìm kiếm/i });
  await search.fill(awbDigits);
}

function awbGridButton(page) {
  return page.locator(
    `button[data-grid-field="awb"][title="AWB: ${awbVisible}"]`,
  );
}

async function main() {
  assertMutationAllowed();
  if (!isE2eMarker(marker)) throw new Error("Marker E2E nội bộ không hợp lệ");

  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await Promise.all([loginIfConfigured(contextA), loginIfConfigured(contextB)]);
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let createdId = "";

  try {
    await Promise.all([
      pageA.goto(`${BASE_URL}/#/`, { waitUntil: "domcontentloaded" }),
      pageB.goto(`${BASE_URL}/#/`, { waitUntil: "domcontentloaded" }),
    ]);
    await Promise.all([selectSessionAndSearch(pageA), selectSessionAndSearch(pageB)]);

    const createdState = await readJson(
      await contextA.request.post(`${BASE_URL}/api/mutation`, {
        data: { action: "ADD", shipment: shipmentDraft() },
      }),
    );
    const created = (createdState.rows || []).find((row) => row.note === marker);
    if (!created?.id) throw new Error("ADD không trả shipment marker");
    createdId = created.id;

    await pageA.reload({ waitUntil: "domcontentloaded" });
    await selectSessionAndSearch(pageA);
    await awbGridButton(pageA).waitFor({ timeout: 10_000 });
    console.log(`PASS L2-CREATE ${createdId}`);

    await awbGridButton(pageB).waitFor({ timeout: 10_000 });
    console.log("PASS L2-SOCKET second context nhận ADD");

    await readJson(
      await contextA.request.post(`${BASE_URL}/api/mutation`, {
        data: { action: "UPDATE", id: createdId, patch: { flight: "E2E02" } },
      }),
    );
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await selectSessionAndSearch(pageA);
    await pageA.getByRole("button", { name: "E2E02" }).waitFor({ timeout: 10_000 });
    console.log("PASS L2-UPDATE + reload");

    await readJson(
      await contextA.request.post(`${BASE_URL}/api/mutation`, {
        data: { action: "DELETE", id: createdId },
      }),
    );
    createdId = "";
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await selectSessionAndSearch(pageA);
    if ((await awbGridButton(pageA).count()) !== 0) {
      throw new Error("DELETE chưa biến mất sau reload");
    }
    console.log("PASS L2-DELETE + reload");
  } finally {
    if (createdId) {
      const state = await readJson(await contextA.request.get(`${BASE_URL}/api/state`));
      const row = (state.rows || []).find((item) => item.id === createdId);
      if (row && row.note === marker && isE2eMarker(row.note)) {
        await readJson(
          await contextA.request.post(`${BASE_URL}/api/mutation`, {
            data: { action: "DELETE", id: createdId },
          }),
        );
        console.log(`CLEANUP ${createdId}`);
      }
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
