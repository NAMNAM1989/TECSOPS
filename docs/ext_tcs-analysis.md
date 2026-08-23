# Phân tích Ext TCS (`chrome-extension-tcs`) — App-click → PC

> **A2 (sau #42):** thư mục `chrome-extension/` (legacy TECS-TCS) đã gỡ. Ext chuẩn = **TCS + SCSC**. Xem `docs/ops-ext-protocol.md`.

**Phạm vi:** research-only (thời điểm #47), không refactor.  
**Baseline:** `main` @ `dd1de48` (sau PR #45, 2026-08-22).  
**Đối chiếu protocol:** [#42](https://github.com/NAMNAM1989/TECSOPS/pull/42) đã merge.  
**Copy rule:** mọi chuỗi UI phải dùng **«Đăng Nhập TCS»**, không «ĐN».

Không xoá credential. Không đề xuất xóa mật khẩu đã lưu.

---

## Tóm tắt điều hành

Mô hình **App-click → Ext PC kho** đã có đủ xương sống trên `main`: MV3 service worker, `content-ops.js` bridge, job `TCS_BOOTSTRAP` / `TCS_SCAN_DATE` / `FILL_ESID` / `DOWNLOAD_ESID_PDF`, OCR CAPTCHA offline (ddddocr ONNX), cookie jar + mutex liên-Ext.

**Ext khuyến nghị cho kho TCS:** `chrome-extension-tcs` (channel `tecsops-tcs-direct-ext`).  
**Không có** thư mục / path `ext_tcs` trên repo. Tên `ext_tcs` trong protocol #42 là **alias khái niệm**, không phải folder.

Khoảng trống lớn nhất so với #42 / ops-ext-protocol:

1. `docs/ops-ext-protocol.md` **chỉ có trên nhánh #42**, chưa merge `main`.
2. Ext đã announce `EXT_READY`, nhưng Ops trên `main` **bỏ qua** — không ping ngay, không chip trạng thái.
3. «Trực quan» + Ext **offline** vẫn fallback Railway (`["extension", "agent"]`) — trái với mục tiêu #42 «chỉ Ext».
4. Menu «Tải Ext» vẫn hiện **3** gói (kể cả TECS-TCS).
5. Cùng Chrome profile + 2 Ext TCS = cookie `tcs.com.vn` dùng chung → xung đột session.

Mức rủi ro hệ thống (đường App-click → Ext): **trung bình-cao** nếu PC kho cài cả hai Ext TCS hoặc ZIP thiếu OCR.

---

## 1. Layout thư mục — cái nào là Ext chuẩn?

| Path trên `main` | Tên Chrome | Channel | Kho | Vai trò |
|---|---|---|---|---|
| `chrome-extension-tcs/` | TECSOPS — Kho TCS ESID **v1.5.1** | `tecsops-tcs-direct-ext` | **TCS** | **Khuyến nghị** cho App-click kho TCS |
| `chrome-extension-scsc/` | TECSOPS — Kho SCSC eCargo | `tecsops-scsc-ecargo-ext` | SCSC | **Khuyến nghị** cho eCargo VCT |
| `chrome-extension/` | TECSOPS — Kho TECS-TCS ESID **v2.6.1** | `tecsops-tcs-ext` | TECS-TCS | Legacy hub — #42 soft-deprecate |
| `ext_tcs/` | — | — | — | **Không tồn tại** |

Protocol #42 viết `ext_tcs / ext_scsc` trong sơ đồ — đó là tên gọi, map 1-1 sang `chrome-extension-tcs` / `chrome-extension-scsc`.

Packaging / download (`scripts/package-chrome-extension.mjs`, `server/index.mjs`):

- `tecsops-chrome-extension-tcs.zip` ← `chrome-extension-tcs`
- `tecsops-chrome-extension.zip` ← `chrome-extension` (TECS-TCS)
- `tecsops-chrome-extension-scsc.zip` ← `chrome-extension-scsc`

Hai Ext TCS **fork gần nhau** (cùng kiến trúc), nhưng **không đồng bộ**:

| | `chrome-extension-tcs` | `chrome-extension` (TECS-TCS) |
|---|---|---|
| Manifest | 1.5.1 | 2.6.1 |
| `content-tcs` `SCRIPT_VERSION` | **2.0.29** | **2.0.26** |
| Storage keys | `tecsopsTcsDirect*` | `tecsopsTcs*` / `tecsopsTcsHubCookieJar` |
| Window API | `__TECSOPS_TCS_DIRECT__` | `__TECSOPS_TCS__` |
| Agent port OCR | **8766** | **8765** |
| `EXT_READY.portalWarehouse` | `"TCS"` | *(không gửi)* |

**Khuyến nghị vận hành PC kho TCS:** chỉ load unpacked `chrome-extension-tcs`, **Chrome profile riêng** với Ext TECS-TCS. Cùng profile = cookie `tcs.com.vn` dùng chung — đây là ràng buộc trình duyệt, không tách được bằng channel.

---

## 2. Kiến trúc MV3

```
Người dùng bấm nút trên Ops (Railway / localhost)
        ↓  window.postMessage { channel, direction:"to-ext", id, type, payload }
content-ops.js  (matches Ops origins, run_at: document_start)
        ↓  chrome.runtime.sendMessage
service worker  background.js
        ↓  tabs + scripting + cookies + offscreen OCR
content-tcs.js  (tcs.com.vn / AwbLogin + Esid/Export)
```

### 2.1 Service worker (`background.js`)

- MV3 `service_worker`, giữ sống bằng `chrome.storage.session.get` mỗi 15s khi job dài (`withServiceWorkerKeepAlive`).
- Lệnh: `PING` → `PONG` + `workspace`; `TCS_OPEN`; `TCS_BOOTSTRAP`; `TCS_SCAN_DATE`; `TCS_INVALIDATE_SESSION`; `FILL_ESID`; `DOWNLOAD_ESID_PDF`; `AGENT_FETCH`.
- eCargo types → `WRONG_EXTENSION` (đúng: đẩy sang Ext SCSC).
- PDF dùng `chrome.debugger` `Page.printToPDF` (quyền `debugger` — nhạy cảm).
- Tab ownership: chỉ dùng `workspace.tab_id` do chính Ext này tạo — không nhặt tab Ext kho kia.

### 2.2 Content scripts

**`content-ops.js`** (trang Ops):

- Chỉ nhận khi `event.source === window` **và** `event.origin === location.origin`.
- Reply `postMessage(..., OPS_ORIGIN)` — không dùng `*`.
- Announce `EXT_READY` **một lần** lúc inject (`document_start`).
- Nếu SW vừa Reload: `EXT_CONTEXT_INVALIDATED` + hướng dẫn F5 Ops.

**`content-tcs.js`** (portal TCS):

- IIFE idempotent: inject lại chỉ cập nhật runner, không thêm listener nếu `window.__TECSOPS_TCS_LISTENER__` đã set.
- Login: `#basic_username`, `#basic_password`, `#basic_captchaCode` trên `/AwbLogin`.
- CAPTCHA: lấy `data:image` / fetch ảnh / canvas; điền + **focus → input → change → blur** (Ant Design).
- Quét ngày, điền eSID, tải PDF HTML → background in PDF.

**Lưu ý dual-inject trong cùng Ext:** manifest inject `content-tcs.js` **và** SW `chrome.scripting.executeScript({ files: ["content-tcs.js"] })`. Cơ chế idempotent + `EXPECTED_SCRIPT_VERSION` (`2.0.29`) là để giảm listener kép — không phải conflict liên-Ext.

### 2.3 Messaging Ops ↔ Ext

Ops: `src/utils/tcsChromeExtension.ts`

- Kho TCS → channel `tecsops-tcs-direct-ext`.
- Envelope: `{ channel, direction, id, type, payload }` / result cùng `id`.
- Timeout job: PING 2.5s · bootstrap/scan/PDF 180s · fill 120s.
- `expected_username` tự gắn cho Quét / Điền / PDF từ `localStorage` `tecsops-tcs-ext-login-v1` (chỉ **username**, không password).

Trên `main`, listener Ops **nuốt** `EXT_READY`:

```180:182:src/utils/tcsChromeExtension.ts
    if (data.type === "EXT_READY") {
      return;
    }
```

#42 thêm `subscribeTcsExtensionReady` + `tcsExtPresence` (`offline` / `ready` / `logged_in`) — **chưa có trên main**.

Ops poll `PING` mỗi 10s khi bar TCS active (`useTcsPortalActions`). Chip riêng «Ext · offline / sẵn sàng / đã login» **chưa có** — trạng thái Ext lẫn agent trong cùng pill (`TcsPortalInlineBar`).

### 2.4 Storage credential / session

| Key | Area | Nội dung |
|---|---|---|
| `tecsopsTcsDirectSessionCredentials` | `chrome.storage.session` | `{ username, password }` — hết khi đóng Chrome |
| `tecsopsTcsDirectRememberedCredentials` | `chrome.storage.local` | Cùng payload nếu «nhớ mật khẩu» |
| `tecsopsTcsDirectCookieJar` | `chrome.storage.local` | Cookie portal + `username` + `saved_at` |
| `tecsopsTcsDirectWorkspace` / `Index` | `chrome.storage.session` | phase, logged_in, tab_id, … |
| `tecsops-tcs-ext-login-v1` | Ops `localStorage` | username + remember **theo kho** (không password) |

Password **plaintext** trong `chrome.storage.local` khi remember. Không encryption. Không xoá trong phân tích này.

---

## 3. Luồng Đăng Nhập TCS

### 3.1 Happy path (desktop, Ext online)

1. Bar TCS → CTA **«Đăng Nhập TCS»** (`tcsLoginCtaLabel`).
2. Form Ext: user / pass / remember → `bootstrapTcsExtension({ login_only: true, agent_base_url: http://127.0.0.1:8766 })`.
3. SW: `saveCredentials` → mở/pin tab `https://www.tcs.com.vn/AwbLogin` → `loginOnTcsTab`.
4. Chờ ảnh CAPTCHA (tối đa ~3s) → OCR Ext (offscreen ONNX / ddddocr `common.onnx`) → fallback agent localhost `/captcha/solve` (8766 rồi 8765) → nếu hard-fail: điền user/pass, **CAPTCHA tay**.
5. Điền 5 ký tự + blur; submit nút «Đăng nhập».
6. Tối đa 6 lần submit / 8 lần lấy ảnh; hết vòng → `CAPTCHA_REQUIRED`.
7. Thành công: `logged_in_username`, `saveCookieJar`, `session_dirty: false`.
8. Ops `invalidateTcsExtensionSession` kho kia (cookie dùng chung).

### 3.2 OCR (ddddocr?)

**Có.** Không gọi API ddddocr Python trong Ext; dùng **model `common.onnx` lấy từ package ddddocr** + ONNX Runtime Web trong `ocr/offscreen.js`.

Chuỗi giải:

1. Ext ONNX, 3 lần, `minConfidence` 0.40 → 0.34 → 0.28; cứu ứng viên 5 ký tự ≥2 phiếu.
2. Agent `POST /captcha/solve` + header `X-Portal-Warehouse: TCS`.
3. Tay trên tab TCS.

ZIP tải từ Ops **phải ~60MB+**. ZIP ~200KB = thiếu `ort.min.js` / `common.onnx` → `OCR_EXT_FAILED` / `CAPTCHA_REQUIRED`. Đã xảy ra khi Railway `prebuild` quên `ext:fetch-ocr` (memory 2026-08-13). Dockerfile hiện có fetch-ocr — vẫn phải kiểm tra size ZIP trên prod.

### 3.3 Failure modes

| Code / triệu chứng | Nguyên nhân điển hình |
|---|---|
| `CREDENTIALS_REQUIRED` | Form Ops trống và storage Ext trống |
| `CAPTCHA_IMAGE_EMPTY` / «Chưa thấy ảnh CAPTCHA» | Trang chưa hydrate / selector đổi |
| `OCR_LOW_CONFIDENCE` | Ảnh mờ / font lạ — đổi ảnh rồi thử lại |
| `OCR_EXT_FAILED` | Thiếu model / offscreen / ORT |
| `OCR_AGENT_UNAVAILABLE` | Ext OCR fail + không có agent localhost |
| `CAPTCHA_FILL_FAILED` | OCR đúng nhưng ô `#basic_captchaCode` không nhận 5 ký tự (React/Ant) |
| `CAPTCHA_REQUIRED` | Hết vòng tự động — user/pass đã điền, chờ tay |
| `WRONG_USER` | Portal đang user kho kia (`confident`) |
| `NEEDS_LOGIN` | Cookie/jar không còn phiên hợp lệ |
| `PORTAL_BUSY` | Ext kho kia giữ mutex `tecsops_portal_lock` (150s) — **không** fallback agent |
| `TIMEOUT` | Ops không nhận result (SW chết, Ext offline, job > timeout) |
| `EXT_CONTEXT_INVALIDATED` | Reload Ext mà chưa F5 Ops |

**Captcha blur / clear:** `fillAndSubmitLogin` cố ý `focus → input → change → blur`. Nếu Ant Design reset value lúc blur, `captchaLength !== 5` → refresh ảnh → thử lại. Đây là failure mode **lặp lại**, không phải edge hiếm.

### 3.4 Session keep (~90 phút?)

**Không có hằng số 90 phút** trong Ext TCS hay agent Python cho idle portal.

Cái «giữ session» thực tế:

- Cookie jar local + `ensureWarehouseSession` (identity live → khớp jar → restore cookie → login lại nếu `allowLogin`).
- `session_dirty` khi cookie đổi ngoài Ext (`chrome.cookies.onChanged`).
- `TCS_INVALIDATE_SESSION` **giữ jar**, chỉ đánh dirty — thao tác sau tự restore.
- Mutex portal `localStorage['tecsops_portal_lock']` TTL **150s**.

«~90 phút» khớp hơn với **quy tắc eCargo ≥90 phút trước giờ hàng vào** (`chrome-extension-scsc`, `buildEcargoVctFillPayload`) — **không** phải TTL phiên TCS. Timeout phiên TCS do server portal (cookie expiry); Ext không refresh chủ động theo đồng hồ.

Nếu vận hành kho thấy phiên TCS chết ~90 phút: đó là hành vi portal, chưa được encode / keep-alive trong Ext. Nên đo `Set-Cookie` / idle thật rồi mới thêm timer — **không đoán**.

### 3.5 Xung đột dual inject / Ext TECS-TCS cũ

Cùng Chrome profile:

1. **Cookie `tcs.com.vn` dùng chung** — hai Ext ghi đè lẫn nhau. Jar + mutex giảm hại, không triệt tiêu.
2. **Hai `content-ops.js` trên Ops** — channel khác nhau → PING không đụng nhau. OK.
3. **Hai `content-tcs.js` trên cùng tab TCS** — isolated world riêng; flag `__TECSOPS_TCS_LISTENER__` **trùng tên**. Isolated world Chrome thường tách theo extension id, nhưng programmatic inject + overlay DOM vẫn có thể chồng (hai overlay, hai lần bắt confirm chuyến bay).
4. **Cùng `EXPECTED` lệch version** (2.0.29 vs 2.0.26) — fork đã drift; vá một bên không vào bên kia.
5. Ext TECS-TCS cũ (pre-jar) + Ext TCS mới trên một profile: cookie bị xóa/ghi không có tầng restore đối xứng.

README / INSTALL của `chrome-extension-tcs` đã bắt **profile riêng**. Menu tải trên `main` vẫn mời cài cả ba — dễ vi phạm điều kiện này.

---

## 4. Handshake vs `docs/ops-ext-protocol.md`

File protocol **không có trên `main`**. Nguồn chuẩn hiện tại: #42 / `docs/ops-ext-protocol.md` trên `cursor/ext-ops-protocol-status-ef32`.

| Type protocol | Ext TCS trên `main` | Ops trên `main` | Ghi chú |
|---|---|---|---|
| `EXT_READY` | Có (kèm `version`, `portalWarehouse: "TCS"`) | **Bỏ qua** | #42: subscribe → ping ngay → chip |
| `PING` → `PONG` + `workspace` | Có | Có (`pingTcsExtension`) | Poll 10s khi bar mở |
| `TCS_OPEN` / `TCS_BOOTSTRAP` / `TCS_SCAN_DATE` / `TCS_INVALIDATE_SESSION` | Có | Có | |
| `FILL_ESID` / `DOWNLOAD_ESID_PDF` / `AGENT_FETCH` | Có | Có | |
| Result cùng `id`, `ok` + `error` | Có | Có; tự gắn `TIMEOUT` | |
| Origin check | Có | Có | |
| Chip Ext · offline / sẵn sàng / đã login | — | **Chưa** | #42 thêm `tcsExtPresence*` |
| Ẩn TECS-TCS khỏi «Tải Ext» | — | Menu vẫn 3 gói | `ChromeExtensionsDownloadMenu` + catalog server |
| «Trực quan» + Ext offline → chỉ Ext | Policy **vẫn Ext→agent** | Test cố ý giữ fallback | #42 muốn khóa Ext kể cả offline |
| `ECARGO_OTP_PROVIDE` | Ext TCS từ chối (đúng) | **Chưa có** hook Ops | Thuộc Ext SCSC / #42 |

`chrome-extension` (TECS-TCS) trên `main` **không** gửi `portalWarehouse` trong `EXT_READY` — chip #42 phải suy từ channel.

#42 **chưa merge**, base lệch `main` (#41 mobile, #45 toast/CTA). Merge #42 cần rebase — chip Ext phải sống trong `TcsPortalInlineBar` compact / Round-3, không phá CTA «Đăng Nhập TCS» luôn hiện (#45).

---

## 5. Rủi ro

### 5.1 Bảo mật — secrets trong `chrome.storage`

- Password TCS plaintext trong `chrome.storage.local` khi remember (mọi extension/devtools trên cùng profile đọc được với quyền storage — thực tế chỉ Ext này có key, nhưng backup profile / malware máy = lộ).
- Cookie jar chứa giá trị cookie session (tương đương hijack portal).
- `host_permissions` rộng: `https://*.up.railway.app/*` + localhost agent. Content-ops inject mọi preview Railway — origin check giảm giả lệnh từ frame lạ, không giảm bề mặt inject.
- Quyền `debugger` (in PDF) = cảnh báo Chrome, có thể bị enterprise chặn.
- Ops `postMessage` gửi password trong payload bootstrap — cùng origin, không mã hóa. XSS Ops = lấy được pass lúc Đăng Nhập TCS.
- Ops **không** lưu password (chỉ username) — tốt.

**Không** đề xuất xóa credential đã lưu. Hướng cứng hóa (P1/P2): `chrome.storage.session` only mặc định; remember = session cookies + jar, không ghi lại password; hoặc OS keychain (nặng).

### 5.2 Độ tin cậy — captcha / ZIP OCR

- ZIP thiếu ONNX → Đăng Nhập TCS PC gãy im, rơi CAPTCHA tay.
- Blur Ant Design xóa CAPTCHA → vòng lặp refresh, user thấy «OCR được nhưng form không nhận».
- SW MV3 bị kill giữa bootstrap nếu keep-alive 15s không đủ (job 180s).
- `EXT_READY` một phát lúc `document_start` — nếu React bind listener sau, mất announce (mitigate bằng poll PING 10s, chậm).

### 5.3 Dual-agent Railway chồng Ext

Trên PC kho, #42 / protocol: **không** dùng Playwright container thay Ext.

`main` vẫn:

- Policy `auto` + «Trực quan» **bật** + Ext **online** → chỉ Ext. Đúng.
- «Trực quan» bật + Ext **offline** → `["extension", "agent"]` → login/scan có thể vào `/tcs-agent` → Chromium headless Railway (`TCS_AGENT_DUAL`, `:8765`/`:8766`, `browser_profile`).  
  Đây là **đúng theo test hiện tại** (`portalExecutorPolicy.test.ts`) và **sai so với #42**.
- `TCS_AGENT_DUAL` mặc định **0** trên Railway — agent kho TCS `:8766` thường tắt; fallback TCS dễ đụng nhầm hub `:8765` / user `hanam7195` nếu proxy thiếu header (đã vá `X-Portal-Warehouse`, vẫn là footgun).
- Hai luồng cùng lúc (Ext PC + agent cloud) ghi cùng tài khoản portal = session stampede. `PORTAL_BUSY` chỉ chặn **hai Ext**, không chặn agent.

Docs `docs/railway-online-portal.md` vẫn mô tả Ext là «fallback desktop tuỳ chọn» — **ngược** protocol #42 (Ext-first). Cần chỉnh docs khi siết App-click.

---

## 6. Khuyến nghị ưu tiên (App-click → Ext vững)

Copy mọi CTA/toast/overlay user-facing: **«Đăng Nhập TCS»** / «Thử Đăng Nhập TCS». Không «ĐN».

Chuỗi Ext **đang vi phạm** (hiện trên overlay workspace / message Ops):

- `Đã hủy session — ĐN lại đúng user kho trước khi Quét`
- `Đang ĐN ${user} (kho TCS)…`

`tcsLoginCtaLabel` + test #45 đã chặn «ĐN» phía UI React; **chưa** quét `chrome-extension-tcs/background.js`.

### P0 — làm đường App-click ổn trước tính năng mới

1. **Chốt Ext chuẩn kho TCS = `chrome-extension-tcs`.** PC kho: một profile, một Ext TCS. Menu «Tải Ext» chỉ **TCS + SCSC**; TECS-TCS ẩn (giữ ZIP/API để máy cũ). Đây là phần an toàn nhất của #42, ít đụng eSID.
2. **Xử lý `EXT_READY` trên Ops:** subscribe → `pingTcsExtension` ngay → cập nhật chip. Đừng nuốt event. Poll 10s giữ làm fallback.
3. **Chip Ext tách agent** trên `TcsPortalInlineBar` / bar SCSC: `Ext · offline / sẵn sàng / đã login`. CTA «Đăng Nhập TCS» giữ luôn hiện (#45).
4. **Siết «Trực quan»:** desktop + TQ bật → **chỉ Ext**, kể cả offline (chip + «Tải Ext»). Agent chỉ khi tắt TQ hoặc `agent-only` hoặc mobile. Rebase #42 lên `main` hiện tại — **đừng merge #42 nguyên base cũ**.
5. **Gate ZIP OCR:** `/api/chrome-extensions` báo `ok: false` nếu thiếu `ocr/common.onnx` / size < ngưỡng; UI «Tải Ext» cảnh ZIP mỏng. Tránh Đăng Nhập TCS fail im.
6. **Sửa copy «ĐN» trong Ext overlay** (chuỗi user-facing, không phải comment).

### P1 — session / captcha / dual-Ext

1. Profile / install: INSTALL + popup `chrome-extension-tcs` nói rõ «Đăng Nhập TCS»; popup đang mô tả Ext kia là «TCS ESID & SCSC eCargo» — **sai / cũ**.
2. CAPTCHA fill: native setter + `InputEvent` + kiểm tra lại sau blur; nếu clear thì điền lại **không** blur lần 2, hoặc `submit: false` rồi click.
3. Đồng bộ fork: `SCRIPT_VERSION` 2.0.29 vs 2.0.26 — chọn một nguồn (TCS) hoặc ghi rõ TECS-TCS freeze.
4. Keep-alive phiên TCS: đo idle portal thật; nếu ~90 phút đúng, thêm soft ping / restore jar **trước** hết hạn — đừng hardcode 90 nếu chưa đo.
5. Password remember: mặc định chỉ `storage.session` + jar; «nhớ» = username Ops + jar, không ghi lại password (không xóa key cũ tự động trừ khi user tắt nhớ).
6. Docs: merge/adapt `ops-ext-protocol.md` lên `main`; sửa `railway-online-portal.md` (Ext-first PC, agent phụ).

### P2 — cứng hóa lâu dài

1. Session Broker (memory 2026-08-10): một chủ cookie trên máy, hai Ext xin lock — thay hai jar đua.
2. Bỏ / thu hẹp `debugger` (in PDF bằng print-frame / `chrome.printing` nếu đủ).
3. Thu hẹp `host_permissions` Railway về origin prod + localhost, không `*.up.railway.app`.
4. `ECARGO_OTP_PROVIDE` trên Ext SCSC (không invent Gmail).
5. Test handshake: `EXT_READY` → ping; visual+offline không gọi agent; catalog 2 gói.

---

## Phụ lục A — Việc #42 đã làm (chưa trên main)

Nhánh `cursor/ext-ops-protocol-status-ef32` (~755+/140−, 29 files), draft:

- `docs/ops-ext-protocol.md`
- `subscribeTcsExtensionReady`, `tcsExtPresence*`
- Hook `ECARGO_OTP_PROVIDE` / `provideEcargoOtpViaExtension`
- (dự kiến) chip bar + ẩn TECS-TCS + lock visual khi Ext offline

**Không** implement lại trong PR phân tích này. Merge #42 cần rebase qua #41/#45.

## Phụ lục B — Việc cố ý không làm

- Không xóa `chrome.storage` / cookie jar / password đã nhớ.
- Không đụng logic điền eSID.
- Không tắt code agent Railway (chỉ đổi *khi nào* được gọi).
- Không invent path `ext_tcs/`.

## Phụ lục C — File đọc chính

- `chrome-extension-tcs/manifest.json`, `background.js`, `content-ops.js`, `content-tcs.js`, `ocr/*`
- `chrome-extension/` — đã gỡ (A2, sau #42)
- `src/utils/tcsChromeExtension.ts`, `portalExecutorPolicy.ts`, `tcsExtLoginPrefs.ts`, `tcsLoginCtaLabel.ts`
- `src/hooks/useTcsPortalActions.ts`, `src/components/TcsPortalInlineBar.tsx`, `ChromeExtensionsDownloadMenu.tsx`
- `server/index.mjs` (catalog Ext TCS + SCSC)
- `docs/ops-ext-protocol.md` (#42 đã merge)
