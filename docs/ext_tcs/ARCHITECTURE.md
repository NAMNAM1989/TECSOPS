# ext_tcs — Architecture (vanilla MV3)

Mô tả kiến trúc **thật** tại `b1c377d:chrome-extension-tcs/`. Không phải kiến trúc React/Dexie của master brief.

---

## 1. Sơ đồ runtime

```
[Host đã mất trên main #74]
  Ops web (localhost:5173 / Railway)
        │  window.postMessage
        │  { channel: "tecsops-tcs-direct-ext", direction: "to-ext", id, type, payload }
        ▼
content-ops.js          matches Ops origins · run_at: document_start
        │  chrome.runtime.sendMessage({ type, payload })
        ▼
background.js           MV3 service_worker (extension origin)
        │  tabs / scripting / cookies / storage / offscreen / debugger
        ├──────────────► content-tcs.js     tcs.com.vn · document_idle
        ├──────────────► ocr/offscreen.js   OCR_SOLVE (nếu binary có mặt)
        └──────────────► print-frame.html + chrome.debugger Page.printToPDF
```

Origin tách **đúng kiểu MV3**, không phải bug Dexie:

| Origin | File | Vai trò |
|---|---|---|
| Extension | `background.js`, `popup.*`, `ocr/offscreen.*`, `print-frame.html` | Điều phối, storage, OCR, PDF |
| Ops (localhost / Railway) | `content-ops.js` | Handshake; **host đã gỡ trên `main`** |
| `https://www.tcs.com.vn` | `content-tcs.js` | DOM login / scan / fill / PDF HTML |

`chrome.storage` luôn là **extension origin** — content script TCS không đọc trực tiếp credential store. Mutex liên-Ext dùng `localStorage['tecsops_portal_lock']` **trên origin portal** (`background.js` `claimPortalLock`).

---

## 2. Messaging

Envelope (`content-ops.js` header + `b1c377d:docs/ops-ext-protocol.md`):

- Ops → Ext: `{ channel, direction: "to-ext", id, type, payload? }`
- Ext → Ops: `{ channel, direction: "from-ext", id?, type?, ok?, error?, message?, ... }`
- `EXT_READY` không có `id`; kèm `version`, `portalWarehouse: "TCS"`

Bảo vệ bridge (`content-ops.js` L66–70):

- `event.source === window`
- `event.origin === window.location.origin` (`OPS_ORIGIN`)
- `data.channel === "tecsops-tcs-direct-ext"` và `direction === "to-ext"`
- Reply dùng `OPS_ORIGIN`, không `*`

SW (`background.js` L77–209) nhận `type` từ popup hoặc content-ops. `OCR_SOLVE` được để offscreen trả lời (SW return `false`).

Content TCS (`content-tcs.js` L435+) lắng `chrome.runtime.onMessage`: `TCS_PING`, `TCS_SESSION_IDENTITY`, `TCS_LOGOUT`, `TCS_GET_CAPTCHA`, `TCS_LOGIN_STATUS`, `TCS_REFRESH_CAPTCHA`, `TCS_LOGIN`, `TCS_SCAN_DATE`, `FILL_ESID`, `DOWNLOAD_ESID_PDF`. Idempotent qua `window.__TECSOPS_TCS_LISTENER__` + API `window.__TECSOPS_TCS_DIRECT__`.

Keep-alive SW: `withServiceWorkerKeepAlive` poll `chrome.storage.session.get` mỗi 15s khi job dài.

---

## 3. Storage (không Dexie / không IndexedDB)

Không có `indexedDB` / `Dexie` trong cây Ext (đã grep). Store thực tế:

| Key | Area | Payload |
|---|---|---|
| `tecsopsTcsDirectSessionCredentials` | `chrome.storage.session` | `{ username, password }` plaintext |
| `tecsopsTcsDirectRememberedCredentials` | `chrome.storage.local` | cùng shape nếu remember |
| `tecsopsTcsDirectCookieJar` | `chrome.storage.local` | `{ username, cookies[], saved_at }` |
| `tecsopsTcsDirectWorkspace` | `chrome.storage.session` | phase, logged_in, tab_id, message, … |
| `tecsopsTcsDirectWorkspaceIndex` | `chrome.storage.session` | index quét |
| `tecsops_portal_lock` | portal `localStorage` | mutex TTL 150s |

`saveCredentials` / `loadCredentials`: `background.js` L237–257.  
Cookie jar + `cookies.onChanged` → `session_dirty`: L607–736.  
Bốn tầng session: identity live → jar match → restore cookie → login lại nếu `allowLogin` (`ensureWarehouseSession`).

---

## 4. DOM / locators

`locators.json` version 2, `home_url` = `/Esid/Export`. Field IDs (không xác minh live trong Phase 0; **không bịa ID mới**):

`codAwbPfx`, `codAwbNum`, `flightNo`, `datFltOri`, `codFds`, `qtyPcs`, `wgtGrs`, `totalOfHawbs`, `codPayMod`, `shcCod002`, `shipperId`, `addressShp`, `telShp`, `emailShp`, `agentId`, `addressAgt`, `telAgt`, `emailAgt`, `consigneeId`, `addressCne`, `telCne`, `emailCne`, `notifyId`, `natureOfGoods`, `otherRequest`, `shcOth`, `shpRegNam`, `shpRegTel`, `shpRegIdx`, `agreeConfirm`.

`content-tcs.js` `DEFAULT_LOCATORS` **thiếu** `total_hawbs`, `payment_mode`, `tecs_warehouse`, `shc_other` so với JSON. `runFill` có fallback hardcode một phần (`"totalOfHawbs"`, `"codPayMod"`, `"shcCod002"`).

Login IDs (cứng trong content-tcs, không nằm locators.json): `basic_username`, `basic_password`, `basic_captchaCode`.  
Scan: `#search-form_dateSearch`. PDF list: `#search-form_awbNum` / placeholder `AWB#`.  
UI giả định Ant Design (`ant-select`, `ant-picker`, `ant-table`, `ant-modal`).

`ensureDeclareTab`: nếu URL không chứa `/Esid/` thì `location.assign(home_url)`; click tab «KHAI BÁO ESID»; chờ `#codAwbNum`.

---

## 5. Login và CAPTCHA (chỉ mô tả hiện trạng)

`loginOnTcsTab` (`background.js` L985–1136):

1. Reuse session nếu identity / cookie jar khớp.
2. Chờ ảnh CAPTCHA trên form.
3. Nếu offscreen ONNX sẵn sàng: gửi ảnh vào `OCR_SOLVE` (tối đa 6 submit / 8 ảnh).
4. Hard-fail model → điền user/pass, `CAPTCHA_REQUIRED` (người nhập tay).
5. Hết vòng → cùng nhánh tay.

`solveCaptcha` L531–537: **chỉ** Ext ONNX. Comment ghi rõ không còn fallback agent. Tham số `agent_base_url` vẫn được truyền nhưng không dùng cho OCR.

Binary OCR **không có trong git**. `extOcrAssetsReady` chỉ check `ocr/ort.min.js` + `ocr/charsets.json`. `ocr/README.md` mô tả `npm run ext:fetch-ocr` — script đó **đã xóa trên `main`**.

Policy: không mở rộng / không hướng dẫn cải tiến giải CAPTCHA. Xem `DECISIONS.md`.

---

## 6. PDF

`runDownloadPdf` lấy HTML phiếu (canvas → img). SW `printHtmlToPDFBase64` (`background.js` L1378–1434): tab `print-frame.html` → `document.write` → `chrome.debugger` `Page.printToPDF` (A4) → `chrome.downloads.download`. Quyền `debugger` là bề mặt nhạy cảm (cảnh báo Chrome / enterprise).

---

## 7. Permissions

`manifest.json`:

- `tabs`, `scripting`, `storage`, `cookies`, `downloads`, `debugger`, `offscreen`
- Hosts: `tcs.com.vn` + leftover localhost Vite/API + `ops-production-b405.up.railway.app` + `*.up.railway.app`
- CSP `extension_pages`: `script-src 'self' 'wasm-unsafe-eval'` (phục vụ ORT wasm)
- `web_accessible_resources`: `locators.json`, `print-frame.html`, `ocr/*` — matches TCS **và `<all_urls>`**

Không có permission Google Sheets / `googleapis` trong Ext này.

---

## 8. UI

Popup 280px: PING SW, hiện `Kho TCS · v{version} · đã login | chờ Đồng bộ từ Ops`. **Không** có toggle settings. Overlay DOM trên tab TCS: `#tecsops-tcs-direct-workspace` (phase / message / progress).

---

## 9. Test / build (thời điểm b1c377d)

Trong folder Ext:

- Không typecheck, không vitest.
- `scripts/cdp-load-and-verify.mjs`: load unpacked qua CDP, mặc định `CHROME_PATH` Windows; optional probe OCR agent. **Không** chạy trong Phase 0 (có thể đụng live TCS / Chrome local).

Trên monorepo (đã xóa #74): `ext:package`, `ext:fetch-ocr`, `ext:verify`; tests `chromeExtensionPackage.test.ts`, `tcsChromeExtension.test.ts`, `portalSessionIdentity.test.ts`, `scripts/fetch-ext-captcha-ocr.test.mjs`.

Phase 0 check an toàn (2026-08-25): `node --check` 7 file JS/MJS **OK**; `JSON.parse` `manifest.json` / `locators.json` / `charsets.json` **OK**. Không typecheck được vì Ext không có `tsconfig`. Không hit live TCS.

---

## 10. Kiến trúc đề xuất (incremental — không rewrite)

Giữ nguyên: MV3 + vanilla JS + `background.js` / `content-ops.js` / `content-tcs.js` / `locators.json`.

Bước tăng dần (sprint sau Phase 0, chưa làm):

1. **Tách khỏi TECSOPS web runtime** — folder Ext có thể sống lại như package độc lập; không gắn menu / API vào app.
2. **Host lệnh mới** (popup mở rộng hoặc native messaging) thay `content-ops.js` → origin Railway.
3. **Siết storage / message** — mặc định session-only; workspace không chứa CAPTCHA/password.
4. **Thu hẹp permission** — bỏ `*.up.railway.app` nếu không còn host Ops.
5. **Đồng bộ DEFAULT_LOCATORS ↔ locators.json**; Site Analyst xác minh ID trên `/Esid/Export` (quan sát, không bịa).
6. **Test thuần** (AWB 11 số, merge locator, identity blocklist, envelope) tách khỏi DOM live.

Rewrite React+Dexie: **không**. Xem `DECISIONS.md`.
