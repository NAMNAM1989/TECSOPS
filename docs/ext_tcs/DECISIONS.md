# ext_tcs — Decisions (Phase 0)

Mọi quyết định dưới đây dựa trên mã `b1c377d:chrome-extension-tcs/` và trạng thái `main` `f2c8a5c`. Chưa có sprint implementation.

---

## D1 — Không restore Ext vào TECSOPS web app

**Quyết định:** PR #74 gỡ Tải Ext / Đăng Nhập TCS / eCargo là **cố ý và giữ**. Phase 0 và các sprint ổn định **không** thêm lại UI/API đó vào Vite app.

**Lý do:** User / task nêu rõ app removal out of scope. Live app không còn caller → tránh tái 404 / unknown action như sau #72.

**Hệ quả:** `content-ops.js` + `host_permissions` Railway/localhost trở thành leftover cho đến khi có host mới **ngoài** app.

---

## D2 — Giữ vanilla MV3; không rewrite React/Vite/Dexie

**Quyết định:** Kiến trúc đích = incremental từ JS hiện tại. Không greenfield React + Side Panel + Dexie.

**Why không rewrite**

- `runFill` / session jar / mutex / PDF debugger là ~4.5k dòng DOM đã chạy trên portal Ant Design thật.
- Brief React (`src/automation/tcs`, `TcsDomAdapter`, `db.ts`) **không tồn tại** trong repo — rewrite sẽ là sản phẩm mới, không phải recovery.
- Không có test E2E ổn định để hồi quy một port React.

**Limitation:** Vanilla khó typecheck; popup nghèo; host Ops đã mất.

**Alternatives đã xét**

1. Rewrite React+TS+Dexie — bác bỏ ở Phase 0 (chi phí / hồi quy / lệch mã thật).
2. Port từng module sang TS dần, giữ MV3 entry JS — mở được **sau** stabilization.
3. Giữ nguyên JS, chỉ vá P0/P1 — **chọn**.

**Migration / Regression / Rollback:** không có migration. Nếu sau này ai đó đề xuất rewrite, bắt buộc viết lại WHY / LIMITATION / ALTERNATIVES / MIGRATION / REGRESSION / ROLLBACK **trước** khi đụng code.

---

## D3 — CAPTCHA: human-in-the-loop; không mở rộng giải tự động

**Quyết định:** Đường authorized là người nhập CAPTCHA trên tab TCS. Code đã có `CAPTCHA_REQUIRED` (`background.js` L1041–1065, L1115–1135).

**Không làm:** cải tiến OCR, thêm model, thêm fallback solver, mô tả bypass / payload CAPTCHA trong docs hay code.

**Hiện trạng (chỉ ghi nhận):** `ocr/offscreen.js` + ddddocr ONNX đã có trong cây; binary không commit; script fetch đã xóa trên `main`. Đây là **xung đột chính sách**, không phải backlog tính năng.

**Copy:** không in charset, không copy dataUrl / text CAPTCHA vào tài liệu.

---

## D4 — Giả thuyết Dexie origin-split: loại

**Quyết định:** P0 «IndexedDB/Dexie content-script origin vs dashboard origin» **không áp dụng**. Không có Dexie, không có dashboard, không có `src/storage/db.ts`.

**P0 thật cùng chủ đề dữ liệu:** password plaintext + cookie jar trong `chrome.storage` (extension origin) và password đi qua message tới content-tcs. Xử lý ở sprint ổn định — không xóa jar/credential đã lưu trên máy user trong Phase 0.

---

## D5 — Không bịa selector TCS

**Quyết định:** Chỉ liệt kê ID đang có trong `locators.json` / `DEFAULT_LOCATORS` / login hardcode. Phase 0 **không** khẳng định chúng còn đúng trên live `/Esid/Export`.

Site Analyst sprint 1: quan sát HTML hiện tại, đối chiếu từng ID, ghi «còn / mất / đổi» — không đoán ID mới trong PR ổn định trừ khi nhìn thấy trên trang authorized.

---

## D6 — XHR/fetch monkey-patch: loại

**Quyết định:** Grep `XMLHttpRequest`, `prototype.open`, gán lại `fetch` trên cây Ext: **0 match**. Không lên backlog «gỡ monkey-patch» vì không có.

---

## D7 — Google Sheets permission: loại (gói Ext này)

**Quyết định:** Manifest Ext TCS không xin scope Sheets. Sheet trên TECSOPS web là feature app riêng, ngoài spec Ext.

---

## D8 — Tài liệu cũ không restore nguyên khối

**Quyết định:** Không copy `docs/ext_tcs-analysis.md` lên `main`. File đó (#47, baseline `dd1de48`, Ext v1.5.1) **lệch** so với 1.5.3:

- Vẫn mô tả fallback OCR agent `:8765`/`:8766` — `solveCaptcha` tại `b1c377d` đã bỏ.
- Vẫn mô tả Ops `tcsChromeExtension.ts`, chip Ext, menu 3 ZIP — đã xóa #74.
- Khuyến nghị P0 phần lớn là việc **host Ops**, không còn trên `main`.

Giữ pointer: `b1c377d:docs/ext_tcs-analysis.md`, `b1c377d:docs/ops-ext-protocol.md`. SoT mới: bộ `docs/ext_tcs/*` này.

---

## D9 — Copy user-facing «ĐN»

**Quyết định (sprint sau):** chuỗi overlay / workspace còn «ĐN» (`background.js` L151, L928). Đổi thành «Đăng Nhập TCS» khi đụng file đó. Không sửa trong Phase 0 (docs-only).

---

## D10 — Nơi đặt docs

**Quyết định:** `docs/ext_tcs/` trên `main` vì folder Ext không tồn tại. Khi/nếu `chrome-extension-tcs/` được checkout lại như package độc lập, có thể chuyển docs vào trong folder đó — không bắt buộc ở Phase 0.
