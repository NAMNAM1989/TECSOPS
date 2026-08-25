# ext_tcs — Phase 0 recovery report

**Recovery date:** 2026-08-25  
**Current `main`:** `f2c8a5c` — `feat: gỡ Tải Ext, Đăng Nhập TCS và eCargo (#74)`  
**Last full Ext tree:** `b1c377d` — `revert: restore Ext / Đăng Nhập TCS / eCargo (#72) (#73)`  
**Path then:** `chrome-extension-tcs/`  
**Path now:** *không có* trên working tree `main`  
**Candidate `60253f1`:** cùng blob tree folder Ext với `b1c377d` (`git diff --stat 60253f1 b1c377d -- chrome-extension-tcs` rỗng)  
**Product:** Manifest V3 vanilla JS · name `TECSOPS — Kho TCS ESID` · version **1.5.3** · `content-tcs` `SCRIPT_VERSION` **2.0.29**

PR này chỉ thêm `docs/ext_tcs/*`. Không restore folder Ext. Không gắn lại Tải Ext / Đăng Nhập TCS / eCargo vào web app.

Check an toàn: `node --check` 7 JS/MJS **pass**; `JSON.parse` manifest / locators / charsets **pass**. Không typecheck (Ext không có TS). Không chạy CDP. Không hit live TCS.

---

## A. Extension hiện làm gì

Sản phẩm PC kho: điều khiển tab TCS được ủy quyền cho **Đăng nhập / Quét / Điền khai báo / Tải PDF ESID**. Channel `tecsops-tcs-direct-ext`. Cặp với Ext SCSC (eCargo).

Bằng chứng lệnh SW — `b1c377d:chrome-extension-tcs/background.js`:

- L89–111 `PING` → `PONG` + `workspace`
- L113–118 `TCS_OPEN`
- L120–128 `TCS_BOOTSTRAP` (login ± scan)
- L130–138 `TCS_SCAN_DATE`
- L140–157 `TCS_INVALIDATE_SESSION` (giữ jar)
- L159–164 `FILL_ESID` — điền, không HOÀN TẤT
- L166–171 `DOWNLOAD_ESID_PDF`
- L173–184 `AGENT_FETCH` → `AGENT_GONE`
- L186–199 eCargo → `WRONG_EXTENSION`

Điền nhắm `https://www.tcs.com.vn/Esid/Export` (`locators.json` L5; `background.js` L7; `content-tcs.js` L10, `ensureDeclareTab` L1516–1532). `runFill` (`content-tcs.js` L77–371): chuyến bay → master party → Cash/Bank → AWB/PCS/GW → clear Notify/Other Request → tick Khác + Đồng ý (kho TCS) → overlay «kiểm tra rồi HOÀN TẤT».

Đăng nhập: `/AwbLogin` (`background.js` L6), form `basic_*` (`content-tcs.js` L753–755). OCR offscreen **hoặc** nhánh tay `CAPTCHA_REQUIRED`.

Host phát lệnh từng là Ops web (`content-ops.js` + `b1c377d:src/utils/tcsChromeExtension.ts`). **#74 đã xóa host.** Ext unpacked cũ trên PC vẫn chạy SW/content-tcs, nhưng không còn nút trên `main`.

---

## B. Đã tốt — phải giữ

1. **MV3 tách origin đúng cách** — SW / popup / offscreen vs content-tcs vs content-ops. Không chia sẻ IndexedDB giữa TCS origin và extension origin (vì không dùng IndexedDB).
2. **Bridge an toàn hơn `*`** — `content-ops.js` L67–70: `source === window`, `origin === OPS_ORIGIN`, channel + direction.
3. **Không nhặt tab Ext khác** — `findOrOpenTcsTab` chỉ `workspace.tab_id` (`background.js` L260–267).
4. **Bốn tầng chống nhầm user** — identity live (`readSessionIdentity`, blocklist «Email»), cookie jar, `cookies.onChanged` → `session_dirty`, mutex `tecsops_portal_lock` 150s. Memory 2026-08-10 còn đúng với mã 1.5.3.
5. **FILL / PDF bắt `expected_username`** — `ensureWarehouseSession` trước ghi portal (`background.js` L1311, L1449). Không tự login lại trên FILL.
6. **Điền ≠ nộp** — không click `submit_button` / HOÀN TẤT trong `runFill`.
7. **Nghiệp vụ TCS vs TECS-TCS** encoded: Cash + Khác + agree; Bank + `shcCod002`; skip notify / other request (`locators.json` L41; `runFill` L157–164, L215–330).
8. **Idempotent content-tcs** — `__TECSOPS_TCS_LISTENER__` + `EXPECTED_SCRIPT_VERSION` 2.0.29 khớp 2 phía (tránh dual-listener đã từng gặp, memory 2026-07-22).
9. **Từ chối agent / eCargo** rõ ràng thay vì fail im.
10. **Locator file tách** `locators.json` (có thể sửa không đụng runner) + fallback DEFAULT.

Giữ nguyên các invariant này khi vá.

---

## C. Cái đang gãy / rủi ro P0

### C1. Host điều khiển đã mất trên `main`

`content-ops.js` chỉ inject localhost + `*.up.railway.app`. App #74 không còn `postMessage` / menu / API ZIP. **Ext không có đường bấm từ sản phẩm live.** Popup chỉ PING, không phát `TCS_BOOTSTRAP` / `FILL_ESID`.

### C2. Password + session cookie lưu / truyền plaintext

Bằng chứng — **không** copy giá trị:

- `saveCredentials` ghi `{ username, password }` vào `chrome.storage.session` **và** `.local` nếu remember (`background.js` L237–244).
- `TCS_LOGIN` gửi `{ ...credentials, captcha }` xuống content-tcs (`background.js` L1050–1086, L1117–1119; `content-tcs.js` L746–754 điền `#basic_password`).
- Cookie jar local chứa giá trị cookie session (`background.js` L658–675).
- `workspace.message` từng ghi **text CAPTCHA đã đọc** (`background.js` L1075) — lộ qua `PONG` / popup.

Không thấy `console.log` password. Vẫn đủ P0: backup profile / XSS host cũ / DevTools = lộ.

### C3. OCR binary + script fetch không còn trên `main`

Cây `b1c377d` không commit `common.onnx` / `ort.min.js`. `npm run ext:fetch-ocr` + `onnxruntime-web` đã gỡ #74. ZIP/unpacked thiếu model → `OCR_EXT_FAILED` → `CAPTCHA_REQUIRED`. Đây là **đứt đường tự động**, không phải lý do để «sửa OCR». Đường tay vẫn là đường chuẩn (D3).

### C4. P0 Dexie origin-split: **không tồn tại**

Grep Dexie / `indexedDB` trên cây Ext: 0. Dashboard / Side Panel: 0. Chi tiết D4.

---

## D. Cái còn dở

1. **Không có package Ext độc lập** — không `package.json`, không CI riêng, packager nằm monorepo đã xóa.
2. **Popup không phải controller** — không nhập AWB, không bấm Điền, không toggle.
3. **`remember` không có UI trong Ext** — chỉ flag payload từ Ops đã chết. `keepRemember` còn giữ local nếu từng có username (`background.js` L1161–1165).
4. **`DEFAULT_LOCATORS` lệch `locators.json`** — thiếu `payment_mode`, `tecs_warehouse`, `total_hawbs`, `shc_other` (`content-tcs.js` L9–42 vs `locators.json` L7–38).
5. **`agent_base_url` vẫn luân chuyển** nhưng OCR agent đã gỡ (`solveCaptcha` L536).
6. **Copy «ĐN»** còn trong overlay (`background.js` L151).
7. **Test yếu** — xem J / P2.
8. **`docs/ops-ext-protocol.md` chỉ còn trong git history** — handshake spec không có trên `main` (bộ docs này thay thế phần Ext TCS).

---

## E. Cái lỗi thời

| Mục | Bằng chứng | Ghi chú |
|---|---|---|
| Host Ops + `tcsChromeExtension.ts` | xóa `f2c8a5c` | leftover matches trong manifest |
| Agent Playwright / `:8765`/`:8766` | `AGENT_GONE`; `solveCaptcha` comment L536 | `cdp-load-and-verify.mjs` vẫn có probe `/captcha/solve` — dead |
| `docs/ext_tcs-analysis.md` (#47) | v1.5.1, agent fallback, menu 3 ZIP | lệch 1.5.3 + #74; không restore |
| Legacy `chrome-extension/` TECS-TCS | gỡ A2 `#52` | README vẫn nhắc gỡ unpacked cũ |
| `ext:fetch-ocr` / Docker ONNX | xóa #74 | `ocr/README.md` trỏ script chết |
| Tesseract | 0 match | đồn master brief — không có |
| React/Dexie/Side Panel | 0 match history | đồn master brief — không có |

---

## F. Xung đột với workflow `/Esid/Export`

**Khớp mục tiêu:** `home_url` / `ESID_URL` / `ensureDeclareTab` đều nhắm `/Esid/Export` + tab «KHAI BÁO ESID». Điền không HOÀN TẤT phù hợp vận hành có người kiểm.

**Xung đột / chưa chứng minh trên live (Phase 0 không mở TCS):**

1. Mọi `#id` trong `locators.json` là **giả định lịch sử**, không có snapshot HTML 2026-08-25. Nếu portal đổi Ant id, fill/scan/PDF gãy im hoặc warning «Chưa thấy ô AWB».
2. Login gắn `/AwbLogin` + `basic_*`. Nếu Export dùng session khác / SSO, `needsLogin()` (href chứa `awblogin`/`/login` hoặc thấy `basic_username`) có thể sai.
3. Scan/PDF dùng `#search-form_dateSearch` / `#search-form_awbNum` — trang Export có cả KHAI BÁO và DANH SÁCH; `hardResetUi` Escape từng phá modal chuyến bay (code đã giữ popup khi fail — L368–369).
4. `isTcsWh` heuristic (`payload.warehouse === "TCS"` hoặc cash / `shc_other`) — host mới phải gửi `warehouse` đúng, không mặc định nhầm Bank.
5. Manifest + overlay vẫn nói «OCR CAPTCHA offline» — **xung đột chính sách HITL** (D3), không xung đột URL Export.

**Không bịa selector mới trong báo cáo này.**

---

## G. Ưu tiên P0 / P1 / P2 (đã verify trên mã)

### P0

| ID | Kết luận | Evidence |
|---|---|---|
| Dexie origin split | **Loại** | Không Dexie / IndexedDB / dashboard |
| Credential exposure | **Giữ — có thật** | `saveCredentials` L237; login payload L1081–1086; jar L658; CAPTCHA trong `workspace.message` L1075 |
| Mất host điều khiển | **Có thật** (hệ quả #74) | `content-ops.js` matches vs 0 caller trên `main` |

### P1

| ID | Kết luận | Evidence |
|---|---|---|
| Selector stale vs `/Esid/Export` | **Chưa verify live** — rủi ro có thật, không khẳng định sai | `locators.json`; `DEFAULT_LOCATORS` drift; login/scan IDs hardcode |
| XHR/fetch monkey-patch | **Loại** | 0 match |
| Settings toggle không wire | **Một phần** — không có toggle trong popup; `remember`/OCR phụ thuộc host + binary đã mất | `popup.html` L44–53; `keepRemember` L1161–1165 |

### P2

| ID | Kết luận | Evidence |
|---|---|---|
| OCR/Tesseract chết | Tesseract **không có**. ONNX **có source, thiếu binary + fetch script**. Policy: không «fix OCR» | `ocr/offscreen.js`; `ocr/README.md`; #74 xóa `ext:fetch-ocr` |
| Unused / leftover | Host Railway/localhost; `agent_base_url`; CDP probe agent | `manifest.json` L15–23; `loginOnTcsTab` signature |
| Google Sheets scope | **Loại** (gói này) | manifest permissions |
| Test yếu | **Có thật** | không test trong folder Ext; host tests xóa #74; CDP Windows-only |

---

## H. Kiến trúc đề xuất (incremental)

Giữ React+TS **của TECSOPS app** nguyên trạng (không gắn Ext).  
Giữ **vanilla JS + MV3** của Ext.

```
[Sprint sau — chưa làm]
  Controller ngoài app (popup mở rộng / native message / trang local không phải TECSOPS)
        → content-ops (siết matches) hoặc chrome.runtime trực tiếp
background.js (giữ)
        → content-tcs.js + locators.json (giữ)
        → chrome.storage.session mặc định; jar cookie giữ
        → CAPTCHA tay (OCR giữ nguyên, không nâng)
```

Không Side Panel React. Không Dexie. Chi tiết D2.

---

## I. Phân công chuyên gia (đề xuất)

| Vai | Việc sprint ổn định | Không làm |
|---|---|---|
| **Site Analyst** | Session authorized trên `/Esid/Export` + `/AwbLogin`: đối chiếu từng ID `locators.json` + `basic_*` + search-form; chụp cấu trúc (không dump PII). Ghi còn/mất. | Không bịa ID; không script phá |
| **Core Engineer** | (1) Quyết định re-home folder Ext **không** wire app. (2) Session-only password; bỏ CAPTCHA khỏi `workspace.message`. (3) Thu hẹp `host_permissions` / `web_accessible_resources` `<all_urls>`. (4) Copy «ĐN». | Không rewrite; không nâng OCR |
| **Automation / Data** | Sync DEFAULT ↔ JSON; unit test AWB 11 số, identity blocklist, envelope, locator merge (trích hàm, không cần Chrome). | Không E2E live phá hủy |
| **UI / UX Ops** | Host lệnh tối thiểu ngoài TECSOPS: login tay + điền + PDF. Popup nói rõ «Đăng Nhập TCS», HITL CAPTCHA. | Không Tải Ext trên app |
| **QA** | `node --check` + JSON + unit trên CI khi folder về. Cấm CDP live trong CI. Checklist tay: điền không HOÀN TẤT; WRONG_USER; PORTAL_BUSY. | Không credential trong log fixture |

---

## J. Sprint implementation đầu (chỉ ổn định)

Chưa start (xem `AGENT_STATUS.md`). Phạm vi đề xuất, **không feature mới**:

1. **Re-home docs-aware:** nếu checkout lại `chrome-extension-tcs/` từ `b1c377d`, giữ ngoài runtime Vite — không `public/downloads` ZIP, không `/api/chrome-extensions`.
2. **Credential hygiene:** mặc định không ghi password `storage.local`; xóa text CAPTCHA khỏi `setWorkspace` message; không log payload login.
3. **Locator sync + audit note:** DEFAULT = JSON; Site Analyst điền bảng còn/mất — chỉ sửa ID khi thấy trên trang.
4. **Permission leftover:** bỏ host Railway/localhost nếu không còn content-ops host; thu `<all_urls>` WAR.
5. **HITL login:** copy overlay hướng dẫn nhập CAPTCHA tay; **không** thêm model OCR.
6. **Test thuần** cho identity / AWB / envelope / locator merge.
7. **Copy «Đăng Nhập TCS»** thay «ĐN».

Cửa xong sprint 1: Ext load unpacked độc lập vẫn PING được; password không vào local mặc định; không còn CAPTCHA trong PONG; locator file đồng bộ; zero thay đổi TECSOPS app routes/API.

---

## Phụ lục — Mapping brief → file thật

| Brief | Kết quả |
|---|---|
| `chrome-extension-tcs/` | Last live path @ `b1c377d` |
| `ext_tcs/` | Không từng có |
| `docs/ext_tcs-analysis.md` | Có @ `b1c377d`; xóa #74; **stale** — không restore |
| `docs/PROJECT_AUDIT_REPORT.md` | Không có trên history (0 commit) |
| `package.json` / `vite.config.ts` / `tsconfig.json` **của Ext** | Không có |
| service worker | `background.js` |
| TCS content script | `content-tcs.js` |
| Dashboard / Side Panel | Không có — `popup.html` |
| Dexie `db.ts` / settings-store | Không có — `chrome.storage` keys `tecsopsTcsDirect*` |

## Phụ lục — Cây file (line counts @ `b1c377d`)

```
1520  chrome-extension-tcs/background.js
2976  chrome-extension-tcs/content-tcs.js
 124  chrome-extension-tcs/content-ops.js
  75  chrome-extension-tcs/manifest.json
  43  chrome-extension-tcs/locators.json
  54  chrome-extension-tcs/popup.html
  31  chrome-extension-tcs/popup.js
   8  chrome-extension-tcs/print-frame.html
   7  chrome-extension-tcs/README.md
   9  chrome-extension-tcs/INSTALL.txt
 232  chrome-extension-tcs/ocr/offscreen.js
  12  chrome-extension-tcs/ocr/offscreen.html
  29  chrome-extension-tcs/ocr/README.md
   0* chrome-extension-tcs/ocr/charsets.json   (*1 dòng, 8210 entry — không dump)
 749  chrome-extension-tcs/scripts/cdp-load-and-verify.mjs
```
