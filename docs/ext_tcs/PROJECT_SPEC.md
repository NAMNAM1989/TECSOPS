# ext_tcs — Product spec (Phase 0)

**Sản phẩm:** Chrome extension Manifest V3 vanilla JS, tên Chrome **«TECSOPS — Kho TCS ESID»**, version **1.5.3**.  
**Alias khái niệm:** `ext_tcs`. **Folder thật:** `chrome-extension-tcs/`. Folder `ext_tcs/` **không từng tồn tại** trên repo.  
**Baseline mã:** commit `b1c377d` (sau PR #73 restore, trước PR #74 xóa). Cây `chrome-extension-tcs/` tại `60253f1` **trùng** `b1c377d` (`git diff --stat` rỗng).  
**Trạng thái trên `main` hiện tại (`f2c8a5c`, PR #74):** folder **không còn**. Root repo là TECSOPS Vite web app. PR này **không** khôi phục folder vào runtime app.

Nguồn đọc: `b1c377d:chrome-extension-tcs/{manifest.json,README.md,INSTALL.txt,background.js,content-ops.js,content-tcs.js,locators.json,popup.html,popup.js}` và `b1c377d:docs/{ext_tcs-analysis.md,ops-ext-protocol.md}`.

---

## 1. Việc extension làm (authorized TCS eSID Export)

Trên máy PC kho, extension điều khiển tab `https://www.tcs.com.vn` cho **tài khoản TCS độc lập** (mã kho dữ liệu **TCS** và **TECS-TCS**). Cặp vận hành với `chrome-extension-scsc` (eCargo — ngoài phạm vi sản phẩm này).

Luồng chính, theo `background.js` listener + `content-tcs.js`:

| Lệnh | Việc làm | Nơi thực thi |
|---|---|---|
| `TCS_OPEN` | Mở / focus tab portal do **chính Ext này** tạo (`workspace.tab_id`) | SW |
| `TCS_BOOTSTRAP` | Lưu credential → mở `https://www.tcs.com.vn/AwbLogin` → đăng nhập (OCR hoặc tay) → optionally quét ngày | SW + content-tcs |
| `TCS_SCAN_DATE` | Quét danh sách tiếp nhận theo ngày phiên | content-tcs `#search-form_dateSearch` |
| `FILL_ESID` | Điều hướng `/Esid/Export`, tab «KHAI BÁO ESID», điền form, **không bấm HOÀN TẤT** | content-tcs `runFill` |
| `DOWNLOAD_ESID_PDF` | Tìm AWB trên danh sách → lấy HTML phiếu → SW `Page.printToPDF` + `chrome.downloads` | content-tcs + SW |
| `TCS_INVALIDATE_SESSION` | Đánh `session_dirty`, **giữ** cookie jar | SW |
| `PING` → `PONG` | Trả `version`, `portalWarehouse: "TCS"`, `workspace` | SW |
| `AGENT_FETCH` | Từ chối `AGENT_GONE` (agent Python đã gỡ) | SW |
| `ECARGO_*` / `FILL_ECARGO_VCT` | Từ chối `WRONG_EXTENSION` | SW |

Channel Ops↔Ext: `tecsops-tcs-direct-ext` (`content-ops.js` L19, README).  
URL nghiệp vụ khai báo: `https://www.tcs.com.vn/Esid/Export` (`background.js` `ESID_URL`; `locators.json` `home_url`; `content-tcs.js` `DEFAULT_LOCATORS.home_url`).

Điền eSID (kho TCS) theo `content-tcs.js` `runFill` + ghi chú `locators.json`:

1. Chọn chuyến bay trước (modal), dừng nếu chưa «Đồng ý».
2. Chọn master shipper / agent / consignee từ danh mục TCS (không ghi đè text nếu score thấp).
3. **Không** dùng Notify (`#notifyId` luôn clear).
4. **Không** nhập Other Request (xóa `otherRequest` / `shcOthReq` nếu còn).
5. Kho TCS: Tiền mặt/Cash + tick Khác/Other + `#agreeConfirm`. TECS-TCS: Bank + optional `#shcCod002`.
6. AWB 11 số (`codAwbPfx` 3 + `codAwbNum` 8), PCS, GW, dest, registrant.
7. Overlay bảo user **kiểm tra rồi HOÀN TẤT trên TCS** — Ext không submit.

Đăng nhập: form `#basic_username` / `#basic_password` / `#basic_captchaCode` trên `/AwbLogin`. Có nhánh **nhập CAPTCHA tay** (`CAPTCHA_REQUIRED`) khi OCR thiếu model / hết vòng. **Chính sách Phase 0+:** coi đường tay là đường authorized; không mô tả / không triển khai cải tiến giải CAPTCHA (xem `DECISIONS.md`).

---

## 2. Việc extension không làm

- Không phải React / Vite / Dexie / Side Panel / Dashboard app. Popup chỉ hiện version + trạng thái login (`popup.html` / `popup.js`).
- Không khôi phục «Tải Ext» / «Đăng Nhập TCS» / eCargo vào TECSOPS web (PR #74 cố ý).
- Không điền eCargo VCT (đẩy sang Ext SCSC).
- Không gọi Playwright / agent Railway (`AGENT_FETCH` → `AGENT_GONE`; OCR agent `:8765`/`:8766` đã gỡ trong `solveCaptcha`).
- Không bấm HOÀN TẤT trên form khai báo.

---

## 3. Host đã mất (sau #74)

Tại `b1c377d`, Ops web (`src/utils/tcsChromeExtension.ts`) gửi `postMessage` trên origin localhost / Railway. PR #74 xóa host đó cùng `/api/chrome-extensions`, `/api/tcs-extension*`, menu Tải Ext.

Hệ quả spec: **xương sống Ext vẫn là App-click → Ext PC**, nhưng **không còn UI/API phát lệnh trên `main`**. Mọi sprint sau phải có host mới (standalone controller / native message / manual popup) — **không** gắn lại vào TECSOPS app trừ khi có quyết định sản phẩm riêng.

`manifest.json` vẫn `host_permissions` + `content_scripts` cho `localhost:5173/3001` và `*.up.railway.app` — leftover sau khi host bị gỡ.

---

## 4. Giả thuyết master brief — đã loại

Các path / class sau **không có** ở bất kỳ commit nào của repo này (đã grep toàn history):

- `src/automation/tcs`, `src/app/dashboard`, `src/storage/db.ts`
- `TcsLoginHelper`, `TcsDomAdapter`, `TcsSelectors`, `TcsDiscovery`
- `AutomationEngine`, `FieldMapping`, Dexie, Side Panel

Logic tương đương nằm **inline**:

| Brief mong đợi | Thực tế tại `b1c377d` |
|---|---|
| TcsSelectors / FieldMapping | `locators.json` + `DEFAULT_LOCATORS` trong `content-tcs.js` |
| TcsDomAdapter / AutomationEngine | `setById`, `fillMasterField`, `runFill`, `runDownloadPdf` trong `content-tcs.js` |
| TcsLoginHelper / TcsDiscovery | `fillAndSubmitLogin`, `readSessionIdentity`, `ensureWarehouseSession` |
| db.ts / settings-store | `chrome.storage.session` / `.local` keys `tecsopsTcsDirect*` |
| Dashboard / Side Panel | `popup.html` (status-only) |

---

## 5. Cây nguồn (extension only)

```
chrome-extension-tcs/                         @ b1c377d  (deleted on main f2c8a5c)
├── INSTALL.txt
├── README.md
├── manifest.json                             MV3 · v1.5.3
├── background.js                             service worker · 1520 dòng
├── content-ops.js                            bridge Ops · 124 dòng
├── content-tcs.js                            DOM TCS · 2976 dòng · SCRIPT_VERSION 2.0.29
├── locators.json                             esid_declare · home /Esid/Export
├── popup.html
├── popup.js
├── print-frame.html                          vỏ rỗng cho printToPDF
├── ocr/
│   ├── README.md
│   ├── charsets.json                         bảng charset ddddocr (8210 mục; không in nội dung)
│   ├── offscreen.html
│   └── offscreen.js                          ONNX Runtime Web
└── scripts/
    └── cdp-load-and-verify.mjs               smoke CDP, hardcoded Chrome Windows
```

**Không có trong git:** `ocr/common.onnx`, `ocr/ort.min.js` (artifact build; `ocr/README.md`).  
**Không có:** `package.json` / `tsconfig.json` / `vite.config.ts` trong folder Ext. Build ZIP từng là `scripts/package-chrome-extension.mjs` + `npm run ext:package` trên monorepo (đã xóa #74).

Companion đã xóa cùng #74 (không restore trong PR này): `docs/ext_tcs-analysis.md`, `docs/ops-ext-protocol.md`, `scripts/package-chrome-extension.mjs`, `src/utils/tcsChromeExtension.ts`.

---

## 6. Ràng buộc sản phẩm

- Chỉ tài khoản / thao tác **được ủy quyền** trên portal TCS của kho.
- Điền ≠ nộp. Người vận hành xác nhận trước HOÀN TẤT.
- CAPTCHA: human-in-the-loop là đường chuẩn; không coi giải CAPTCHA tự động là tính năng cần mở rộng.
- Giữ vanilla JS + MV3. Không rewrite React trừ khi có justification đầy đủ (chưa có — xem `DECISIONS.md`).
