/**
 * Load unpacked TECSOPS extension via CDP (Chrome 137+) and verify PING + Ops bridge.
 *
 * Usage: node chrome-extension/scripts/cdp-load-and-verify.mjs
 */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, "..");
const ROOT = path.resolve(__dirname, "../..");
const USER_DATA = path.join(ROOT, ".tmp-chrome-ext-test");
const PORT = 9223;
const BRIDGE_PORT = 5173;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPort(port, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error(`Chrome CDP not ready on :${port}`);
}

function killTestChrome() {
  if (process.platform !== "win32") return;
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -match 'tmp-chrome-ext-test|remote-debugging-port=${PORT}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "ignore" }
    );
  } catch {
    /* ignore */
  }
}

function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error("ws error")));
  });

  async function send(method, params = {}, sessionId) {
    await ready;
    const id = ++nextId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 20000);
    });
  }

  return { send, close: () => ws.close(), ready };
}

function startBridgeProbeServer() {
  const html = `<!doctype html><html><body><h1>TECSOPS ext bridge probe</h1></body></html>`;
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") resolve({ server: null, reused: true });
      else reject(err);
    });
    server.listen(BRIDGE_PORT, "127.0.0.1", () => {
      resolve({ server, reused: false });
    });
  });
}

async function main() {
  if (!fs.existsSync(path.join(EXT_DIR, "manifest.json"))) {
    throw new Error(`manifest missing in ${EXT_DIR}`);
  }

  killTestChrome();
  await sleep(1000);

  fs.rmSync(USER_DATA, { recursive: true, force: true });
  fs.mkdirSync(USER_DATA, { recursive: true });

  const args = [
    `--user-data-dir=${USER_DATA}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--enable-unsafe-extension-debugging",
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ];
  console.log("launch_chrome", CHROME);
  const child = spawn(CHROME, args, { stdio: "ignore", detached: true });
  child.unref();
  const ver = await waitPort(PORT);
  console.log("browser=", ver.Browser);

  const browser = cdpSession(ver.webSocketDebuggerUrl);
  await browser.ready;

  let loadResult;
  try {
    loadResult = await browser.send("Extensions.loadUnpacked", { path: EXT_DIR });
  } catch (e) {
    console.error("Extensions.loadUnpacked failed:", e.message || e);
    process.exit(1);
  }
  const extId = loadResult.id;
  console.log("loaded_extension_id=", extId);

  // Wait for service worker
  let swTarget = null;
  for (let i = 0; i < 25; i++) {
    const { targetInfos } = await browser.send("Target.getTargets");
    swTarget = (targetInfos || []).find(
      (t) =>
        t.type === "service_worker" &&
        String(t.url || "").includes(`chrome-extension://${extId}/`)
    );
    if (swTarget) break;
    await sleep(200);
  }
  if (!swTarget) {
    // wake SW by messaging via a page later; try open background
    console.log("warn: SW not listed yet — will ping after attach retry");
  } else {
    console.log("service_worker=", swTarget.url);
  }

  // Attach to SW or create a chrome-extension page that can call runtime
  let pingVal = null;
  let bootstrapValidation = null;
  let tcsPageSmoke = null;
  let scanFixture = null;
  let fillFixture = null;
  let flightConfirmFixture = null;
  let manVal = null;

  if (swTarget) {
    const { sessionId } = await browser.send("Target.attachToTarget", {
      targetId: swTarget.targetId,
      flatten: true,
    });
    await browser.send("Runtime.enable", {}, sessionId);
    const swInfo = await browser.send(
      "Runtime.evaluate",
      {
        expression: `({ version: chrome.runtime.getManifest().version, extensionId: chrome.runtime.id, name: chrome.runtime.getManifest().name })`,
        returnByValue: true,
      },
      sessionId
    );
    console.log("service_worker_ok=", JSON.stringify(swInfo.result?.value || null));
  }

  // PING qua popup (đúng đường runtime message như Ops)
  await browser.send("Target.createTarget", {
    url: `chrome-extension://${extId}/popup.html`,
  });
  await sleep(800);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const popup = list.find((t) => String(t.url || "").includes(`${extId}/popup`));
  console.log("popup_url=", popup?.url || null);
  if (popup?.webSocketDebuggerUrl) {
    const page = cdpSession(popup.webSocketDebuggerUrl);
    await page.send("Runtime.enable");
    const text = await page.send("Runtime.evaluate", {
      expression: "document.body && document.body.innerText",
      returnByValue: true,
    });
    console.log("popup_text=", JSON.stringify(text.result?.value || ""));
    const man = await page.send("Runtime.evaluate", {
      expression: `fetch(chrome.runtime.getURL('manifest.json')).then(r=>r.json()).then(j=>({name:j.name,version:j.version,mv:j.manifest_version})).catch(e=>({error:String(e)}))`,
      awaitPromise: true,
      returnByValue: true,
    });
    manVal = man.result?.value;
    console.log("manifest=", JSON.stringify(manVal));
    const ping = await page.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'PING' }, (r) => {
          resolve({
            err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
            r,
          });
        });
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    pingVal = ping.result?.value;
    console.log("ping=", JSON.stringify(pingVal));
    const bootstrap = await page.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'TCS_BOOTSTRAP',
          payload: { session_date: '2026-07-23', awbs: [] }
        }, (r) => resolve({
          err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
          r,
        }));
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    bootstrapValidation = bootstrap.result?.value;
    console.log("bootstrap_validation=", JSON.stringify(bootstrapValidation));
    const pageSmoke = await page.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'TCS_OPEN' }, (opened) => {
          if (!opened?.ok || !opened.tabId) {
            resolve({ ok:false, opened });
            return;
          }
          setTimeout(() => {
            chrome.tabs.sendMessage(opened.tabId, { type: 'TCS_PING' }, (ping) => {
              const pingError = chrome.runtime.lastError?.message || null;
              chrome.tabs.sendMessage(opened.tabId, { type: 'TCS_GET_CAPTCHA' }, (captcha) => {
                resolve({
                  ok: Boolean(ping?.ok),
                  tabId: opened.tabId,
                  pingError,
                  scriptVersion: ping?.scriptVersion || '',
                  loggedIn: ping?.loggedIn === true,
                  captchaDetected: Boolean(captcha?.dataUrl),
                  captchaDiag: captcha?.diag || null,
                });
              });
            });
          }, 1200);
        });
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    tcsPageSmoke = pageSmoke.result?.value;
    console.log("tcs_page_smoke=", JSON.stringify(tcsPageSmoke));
    if (tcsPageSmoke?.tabId) {
      const scanProbe = await page.send("Runtime.evaluate", {
        expression: `new Promise(async (resolve) => {
          const finalTabId = ${Number(tcsPageSmoke.tabId)};
          await chrome.scripting.executeScript({
            target: { tabId: finalTabId },
            func: () => {
              history.replaceState(null, '', '/Esid/Export');
              document.body.innerHTML = \`
                <button>DANH SÁCH ESID</button>
                <input id="search-form_dateSearch">
                <input placeholder="Ngày kết thúc">
                <button class="ant-btn-primary">TÌM KIẾM</button>
                <table><tbody class="ant-table-tbody"><tr>
                  <td>123-12345670</td><td>VN123</td><td>23-07-2026</td>
                  <td>ESID-1</td><td>Hoàn thành tiếp nhận</td>
                </tr></tbody></table>\`;
            }
          });
          chrome.tabs.sendMessage(finalTabId, {
            type: 'TCS_SCAN_DATE',
            payload: { session_date:'2026-07-23', awbs:['12312345670'] }
          }, (result) => resolve({
            error: chrome.runtime.lastError?.message || null,
            ok: result?.ok === true,
            resultError: result?.error || null,
            message: result?.message || null,
            ready: result?.ready?.length || 0,
            listTotal: result?.list_total || 0,
          }));
        })`,
        awaitPromise: true,
        returnByValue: true,
      });
      scanFixture = scanProbe.result?.value;
      console.log("scan_fixture=", JSON.stringify(scanFixture));

      const fillProbe = await page.send("Runtime.evaluate", {
        expression: `new Promise(async (resolve) => {
          const tabId = ${Number(tcsPageSmoke.tabId)};
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const ids = [
                'codAwbPfx','codAwbNum','qtyPcs','wgtGrs','natureOfGoods',
                'shpRegNam','shpRegTel','shpRegIdx'
              ];
              document.body.innerHTML =
                '<button>KHAI BÁO ESID</button>' +
                ids.map(id => '<input id="' + id + '">').join('');
            }
          });
          chrome.tabs.sendMessage(tabId, {
            type: 'FILL_ESID',
            payload: {
              choose_flight:false,
              shipment:{
                awb:'12312345670', pcs:2, gross_weight:10.5,
                nature_of_goods:'TEST GOODS'
              },
              registrant:{name:'TEST USER',tel:'0909',cccd:'1234'}
            }
          }, (result) => resolve({
            error: chrome.runtime.lastError?.message || null,
            ok: result?.ok === true,
            resultError: result?.error || null,
            message: result?.message || null,
            awb: result?.values?.awb || '',
            pcs: result?.values?.qtyPcs || '',
          }));
        })`,
        awaitPromise: true,
        returnByValue: true,
      });
      fillFixture = fillProbe.result?.value;
      console.log("fill_fixture=", JSON.stringify(fillFixture));

      const flightConfirmProbe = await page.send("Runtime.evaluate", {
        expression: `new Promise(async (resolve) => {
          const tabId = ${Number(tcsPageSmoke.tabId)};
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const fieldIds = [
                'codAwbPfx','codAwbNum','qtyPcs','wgtGrs','natureOfGoods',
                'shpRegNam','shpRegTel','shpRegIdx','datFltOri'
              ];
              document.body.innerHTML =
                '<button id="declare-tab">KHAI BÁO ESID</button>' +
                '<input id="flightNo">' +
                fieldIds.map(id => '<input id="' + id + '">').join('') +
                '<button id="choose-flight">CHỌN CHUYẾN BAY</button>';

              document.getElementById('choose-flight').addEventListener('click', () => {
                const wrap = document.createElement('div');
                wrap.className = 'ant-modal-wrap';
                wrap.innerHTML = \`
                  <div class="ant-modal" role="dialog" style="width:760px">
                    <div class="ant-modal-title">Danh sách chuyến bay</div>
                    <div class="ant-modal-body">
                      <input id="flightDate">
                      <span><input id="flightNo"><button class="ant-input-search-button">search</button></span>
                      <table><tbody class="ant-table-tbody">
                        <tr class="ant-table-row"><td>
                          <label class="ant-radio-wrapper"><span class="ant-radio">
                            <input type="radio">
                          </span></label>
                        </td><td>VN 0570 24JUL2026 SGN 24JUL2026 16:30</td></tr>
                      </tbody></table>
                    </div>
                    <div class="ant-modal-footer">
                      <button>Cancel</button><button id="flight-ok">Ok</button>
                    </div>
                  </div>\`;
                document.body.appendChild(wrap);
                const radio = wrap.querySelector('input[type=radio]');
                wrap.querySelector('tr').addEventListener('click', () => {
                  radio.checked = true;
                  radio.closest('.ant-radio-wrapper').classList.add('ant-radio-wrapper-checked');
                });
                wrap.querySelector('#flight-ok').addEventListener('click', () => {
                  if (!radio.checked) return;
                  wrap.remove();
                  setTimeout(() => {
                    const confirmWrap = document.createElement('div');
                    confirmWrap.className = 'ant-modal-wrap';
                    confirmWrap.innerHTML = \`
                      <div class="ant-modal" role="dialog" style="width:620px">
                        <div class="ant-modal-title">Thông báo</div>
                        <div class="ant-modal-body">
                          Bạn có đồng ý chọn chuyến bay này?<br>
                          Chuyến bay: VN0570<br>Ngày bay: 24JUL2026 16:30
                        </div>
                        <div class="ant-modal-footer">
                          <button>Không</button>
                          <button class="ant-btn-primary" id="agree-flight">Đồng ý</button>
                        </div>
                      </div>\`;
                    document.body.appendChild(confirmWrap);
                    confirmWrap.querySelector('#agree-flight').addEventListener('click', () => {
                      document.querySelector('body > #flightNo').value = 'VN0570';
                      document.getElementById('datFltOri').value = '24/07/2026 16:30';
                      confirmWrap.remove();
                    });
                  }, 300);
                });
              });
            }
          });
          chrome.tabs.sendMessage(tabId, {
            type: 'FILL_ESID',
            payload: {
              choose_flight:true,
              shipment:{awb:'12312345670',flight_no:'VN0570'}
            }
          }, (result) => resolve({
            error: chrome.runtime.lastError?.message || null,
            ok: result?.ok === true,
            chooseFlight: result?.fills?.choose_flight === true,
            confirmationAgreed: result?.fills?.flight_confirmation_agreed === true,
            flight: result?.values?.flightNo || '',
            date: result?.values?.datFltOri || '',
            warnings: result?.warnings || [],
          }));
        })`,
        awaitPromise: true,
        returnByValue: true,
      });
      flightConfirmFixture = flightConfirmProbe.result?.value;
      console.log("flight_confirm_fixture=", JSON.stringify(flightConfirmFixture));
    }
    page.close();
  }

  // Ops bridge probe on :5173 (content_scripts match)
  const { server: probeServer, reused } = await startBridgeProbeServer();
  console.log(reused ? "bridge_server=reused :5173" : "bridge_server=started :5173");

  await browser.send("Target.createTarget", {
    url: `http://127.0.0.1:${BRIDGE_PORT}/?ext-probe=1`,
  });
  await sleep(1500);
  const list2 = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const opsPage = list2.find(
    (t) =>
      String(t.url || "").includes(`127.0.0.1:${BRIDGE_PORT}`) &&
      t.webSocketDebuggerUrl
  );

  let bridgeOk = null;
  if (opsPage) {
    const ops = cdpSession(opsPage.webSocketDebuggerUrl);
    await ops.send("Runtime.enable");
    // Reload so content script injects after extension load
    await ops.send("Page.enable");
    await ops.send("Page.reload", { ignoreCache: true });
    await sleep(1200);
    const bridge = await ops.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        const id = 'verify-' + Math.random().toString(16).slice(2);
        const timer = setTimeout(() => resolve({ ok:false, error:'TIMEOUT' }), 3000);
        function onMsg(e) {
          const d = e.data;
          if (!d || d.channel !== 'tecsops-tcs-ext' || d.direction !== 'from-ext') return;
          if (d.id !== id) return;
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          resolve(d);
        }
        window.addEventListener('message', onMsg);
        window.postMessage({ channel:'tecsops-tcs-ext', direction:'to-ext', id, type:'PING' }, '*');
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    bridgeOk = bridge.result?.value || null;
    console.log("ops_bridge=", JSON.stringify(bridgeOk));
    ops.close();
  } else {
    console.log("ops_bridge=no_page");
  }

  const pingOk = pingVal?.r?.ok === true && pingVal?.r?.type === "PONG";
  const workspaceProtocolOk =
    pingVal?.r?.workspace &&
    bootstrapValidation?.r?.ok === false &&
    bootstrapValidation?.r?.error === "CREDENTIALS_REQUIRED";
  const tcsPageOk =
    tcsPageSmoke?.ok === true &&
    tcsPageSmoke?.scriptVersion === "2.0.6";
  const scanFixtureOk =
    scanFixture?.ok === true &&
    scanFixture?.ready === 1 &&
    scanFixture?.listTotal === 1;
  const fillFixtureOk =
    fillFixture?.ok === true &&
    fillFixture?.awb === "12312345670" &&
    String(fillFixture?.pcs) === "2";
  const flightConfirmFixtureOk =
    flightConfirmFixture?.ok === true &&
    flightConfirmFixture?.chooseFlight === true &&
    flightConfirmFixture?.confirmationAgreed === true &&
    flightConfirmFixture?.flight === "VN0570" &&
    String(flightConfirmFixture?.date).includes("24/07/2026");
  const bridgePass = bridgeOk?.ok === true;
  const nameOk =
    !manVal?.name ||
    String(manVal.name).includes("TECSOPS") ||
    manVal.mv === 3;

  if (
    !pingOk ||
    !nameOk ||
    !workspaceProtocolOk ||
    !tcsPageOk ||
    !scanFixtureOk ||
    !fillFixtureOk ||
    !flightConfirmFixtureOk
  ) {
    console.error("FAIL: extension PING");
    try {
      probeServer?.close();
      browser.close();
    } catch {
      /* ignore */
    }
    killTestChrome();
    process.exit(1);
  }
  if (!bridgePass) {
    console.error("FAIL: Ops content-ops bridge (content script not injecting on :5173?)");
    try {
      probeServer?.close();
      browser.close();
    } catch {
      /* ignore */
    }
    killTestChrome();
    process.exit(1);
  }

  console.log("OK: Load unpacked + workspace protocol + PING/PONG + Ops bridge");
  console.log("extension_id=", extId);
  try {
    probeServer?.close();
    browser.close();
  } catch {
    /* ignore */
  }
  // Force-exit: Chrome child + WS can keep the event loop alive
  setTimeout(() => {
    killTestChrome();
    process.exit(0);
  }, 300);
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  try {
    killTestChrome();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
