# QA_AUDIT_REPORT.md

**Project:** TECSOPS / AirCargo_OPS  
**Target:** https://ops-production-b405.up.railway.app  
**Date:** 2026-09-01  
**Method:** Autonomous Playwright MCP full-application audit  
**Code changes:** None (audit-only; no app code modified)

---

# EXECUTIVE SUMMARY

| Metric | Value |
|--------|-------|
| Overall Quality | **READY WITH MINOR FIXES** |
| Total Functions Inventoried | 28 |
| Functions Tested (runtime) | 22 |
| PASS | 16 |
| FAIL | 4 |
| BLOCKED / Partial | 8 |
| Total Test Cases Executed (approx.) | ~45 |
| Total Bugs | 5 |
| P0 | 0 |
| P1 | 1 |
| P2 | 3 |
| P3 | 1 |
| P4 | 0 |

**Verdict ngắn:** Workflow Ops chính (xem lô theo ngày, đổi kho, search, Booking, Khách hàng, Thống kê, Live sync) hoạt động trên production. Có lỗi **modal không đóng bằng Escape** gây block UI, **React DOM crash trong chunk in tem**, và **mutation 400** khi thao tác nhanh/xóa — cần sửa trước khi coi là ổn định hoàn toàn.

---

# FUNCTION INVENTORY

| ID | Module | Function | Trigger | Expected |
|----|--------|----------|---------|----------|
| F001 | Sync | Live status | Boot | Hiển thị Live khi socket OK |
| F002 | Ops | Session date | Date picker / prev-next | Đổi ngày → load lô đúng ngày |
| F003 | Ops | Warehouse tabs | Tablist 4 kho | Lọc / focus kho |
| F004 | Ops | Switch warehouse | Click tabs | Đổi bảng theo kho |
| F005 | Ops | Shipment table | Auto | Hiển thị rows |
| F006 | Ops | Search / filter | Search input | Lọc AWB / miss message |
| F007 | Ops | Status filter | Filter chips | Lọc trạng thái |
| F008 | Ops | + Booking | Toolbar / empty CTA | Tạo lô trống |
| F009 | Ops | Inline AWB edit | Dblclick cell | Validate AWB |
| F010 | Ops | Row actions menu | ⋯ / last button | Mở menu thao tác |
| F011 | Customers | Navigate directory | Khách | `#/customers` |
| F012 | Nav | Back to Ops | Hash / back | Ops restore |
| F013 | Stats | Ops stats | Thống kê | `#/stats` + charts |
| F014 | Settings | Airline label modal | Tên hãng | Open / close / save |
| F015 | Export | Excel day dialog | Xuất Excel | Open / export / close |
| F016 | Import | Google Sheet modal | Nhập Sheet | Open / import / close |
| F017 | Ops | Rapid Booking | Triple click | Không corrupt state |
| F018 | Ops | Delete blank lot | Menu → Xóa | Xóa sau confirm |
| F019 | State | Date after nav | Khách → Ops | Giữ / reset date có chủ đích |
| F020 | Print | Row print actions | Menu In tem / CSD / DIM | Đúng record, không crash |
| F021 | Table | Select A→B | Click rows | Selection đúng |
| F022 | Report | Image report chips | Vantage/Tecs/TCS/SCSC | Enable khi có lô |
| F023 | Cross | Search → menu | Filter then ⋯ | Menu đúng row lọc |
| F024 | Auth | Login gate | Boot | Auth nếu bật token |
| F025 | Mobile | Cards / edit sheet | Viewport mobile | BLOCKED desktop audit |
| F026 | DIM | Dim modal | Open DIM | BLOCKED (không mở sâu) |
| F027 | Print | Thermal / PDF label | PrintShippingLabel | Thấy crash page-print |
| F028 | Sync | WebSocket sync | Live pill | Live khi online |

---

# FUNCTION COVERAGE

| Function | Tests | Pass | Fail | Blocked | Status |
|----------|------:|-----:|-----:|--------:|--------|
| F001 Live | 2 | 2 | 0 | 0 | PASS |
| F002 Date | 3 | 3 | 0 | 0 | PASS |
| F003–F004 Warehouse | 3 | 3 | 0 | 0 | PASS |
| F005 Rows | 2 | 2 | 0 | 0 | PASS |
| F006 Search | 3 | 2 | 0 | 1 | PASS (partial) |
| F007 Status filter | 1 | 1 | 0 | 0 | PASS (discovery) |
| F008 Booking add | 2 | 2 | 0 | 0 | PASS |
| F009 AWB invalid | 1 | 0 | 0 | 1 | BLOCKED |
| F011–F013 Nav pages | 4 | 4 | 0 | 0 | PASS |
| F014 Airline modal | 4 | 2 | 2 | 0 | FAIL (Escape) |
| F015 Excel dialog | 3 | 1 | 1 | 1 | FAIL (Escape) |
| F016 Sheet modal | 2 | 1 | 0 | 1 | PARTIAL |
| F017 Rapid booking | 2 | 1 | 0 | 1 | PASS (creates rows) |
| F018 Delete | 3 | 1 | 0 | 2 | PARTIAL (dialog MCP) |
| F019 Date after nav | 2 | 0 | 1 | 1 | FAIL / design? |
| F020 Print menu | 2 | 1 | 1 | 0 | FAIL (crash) |
| F021 Select A/B | 1 | 1 | 0 | 0 | PASS |
| F022 Image report | 2 | 1 | 0 | 1 | PASS when lots |
| F025–F026 Mobile/DIM | 0 | 0 | 0 | 2 | BLOCKED |
| F027 Print label DOM | 1 | 0 | 1 | 0 | FAIL |

---

# BUG SUMMARY

| Bug | Severity | Module | Function | Reproducible | Root Cause | Fix Priority |
|-----|----------|--------|----------|--------------|------------|--------------|
| BUG-001 | P2 | Settings | F014 Airline modal Escape | Always | Missing Escape / focus-trap | P1 immediate UX |
| BUG-002 | P2 | Export | F015 Excel dialog Escape | Always | No Escape handler | P1 |
| BUG-003 | P2 | Import | F016 Sheet modal Escape | Likely | No Escape / focus-trap | P2 |
| BUG-004 | P1 | Print | F020/F027 PrintShippingLabel | Reproduced once+ | React insertBefore in page-print | P1 |
| BUG-005 | P3 | Sync/CRUD | F017/F018 Rapid mutate | Intermittent | `/api/mutation` 400 | P2 |

---

# DETAILED BUG REPORTS

## BUG-001 — Airline “Tên hãng” modal không đóng bằng Escape; overlay chặn Ops

**Severity:** P2 (có thể nâng P1 khi user không biết nút Đóng)

**Module:** Settings / AirlineLabelSettingsModal  

**Affected Function:** F014  

**Reproducibility:** Always  

**Precondition:** Ops mở, bấm **Tên hãng**

**Steps to Reproduce:**
1. Mở https://ops-production-b405.up.railway.app/#/
2. Click **Tên hãng**
3. Nhấn **Escape** nhiều lần
4. Thử click warehouse tabs phía dưới

**Expected:** Modal đóng; Ops tương tác được  

**Actual:** Modal vẫn mở; overlay `role="dialog"` intercept pointer events (warehouse tabs click timeout). Nút **Đóng** (aria-label) vẫn đóng được.

**Evidence:**
- Runtime: Escape ×5 không đóng; phải remove DOM hoặc click Đóng
- Playwright error: `dialog ... intercepts pointer events` khi click tab kho

**Console Error:** (không bắt buộc)  

**Minimal Reproduction:** `OPEN Tên hãng → Escape → FAIL`  

**Likely Root Cause:** `AirlineLabelSettingsModal` không dùng `useModalFocusTrap` và không có listener `keydown Escape`. Chỉ có nút `onClick={onClose}`. Hook `useModalFocusTrap` đã tồn tại và được dùng ở `MobileDimKgModal` / `CsdPrintModal`.

**Relevant Code:**
- `src/components/AirlineLabelSettingsModal.tsx` (dialog shell, không Escape)
- `src/hooks/useModalFocusTrap.ts` (đã có `onEscape`)

**Recommended Fix:** Gắn `useModalFocusTrap(open, ref, onClose)`; optionally đóng khi click backdrop.

**Regression Risk:** Low  

**Regression Tests Required:**
1. Open airline modal → Escape → dialog count = 0  
2. Open → click warehouse tab without close → must not timeout (dialog closed first)

---

## BUG-002 — Dialog Xuất Excel không đóng bằng Escape; overlay z-[490] block UI

**Severity:** P2  

**Module:** Export / DayExcelExportDialog  

**Affected Function:** F015  

**Reproducibility:** Always  

**Steps:**
1. Click **Xuất Excel**
2. Press Escape
3. Try click **Nhập Sheet** / toolbar

**Expected:** Dialog đóng  

**Actual:** Escape không đóng; overlay `fixed inset-0 z-[490] bg-black/40` chặn click. Nút **Hủy** đóng được. Backdrop `onClick={onClose}` có trong code nhưng Escape không được gắn.

**Evidence:** Runtime overlay intercept khi click Nhập Sheet sau Escape Excel.

**Likely Root Cause:** `DayExcelExportDialog.tsx` không listen Escape; không dùng `useModalFocusTrap`.

**Recommended Fix:** Thêm Escape via `useModalFocusTrap` hoặc `keydown` trên document khi `open`.

**Regression Tests:** Open Excel → Escape → no overlay; toolbar clickable.

---

## BUG-003 — Google Sheet import modal thiếu Escape handler (likely)

**Severity:** P2  

**Module:** Import / GoogleSheetImportModal  

**Affected Function:** F016  

**Reproducibility:** Likely Always (code: không có Escape/`useModalFocusTrap`)  

**Evidence:** Source review — không match Escape/useModalFocusTrap trong file. Runtime full Escape probe bị block bởi BUG-002 trước đó.

**Recommended Fix:** Cùng pattern focus-trap + Escape như CSD/DIM modals.

---

## BUG-004 — Print flow gây React DOM crash (`insertBefore`) và UI Ops vỡ

**Severity:** P1  

**Module:** Print / PrintShippingLabel (chunk `page-print`)  

**Affected Function:** F020 / F027  

**Reproducibility:** Reproduced in session (sau tương tác print/menu); UI còn lại chỉ `(chưa có dest)` + `aria-hidden` cho đến khi hard reload.

**Steps (observed):**
1. Ngày có lô (2026-08-29)
2. Mở row actions → thao tác in/print-related
3. Console: `NotFoundError: Failed to execute 'insertBefore' on 'Node'` trong `page-print-*.js`
4. Ops UI hỏng / không còn toolbar cho đến hard reload `?qa=timestamp`

**Expected:** In tem / đóng print không phá cây React Ops  

**Actual:** Uncaught React DOM error; app shell có thể kẹt trạng thái ẩn.

**Evidence:**
```
NotFoundError: insertBefore ... @ .../assets/page-print-DGM4zunq.js
```
UI snapshot sau lỗi: chỉ còn text `(chưa có dest)` với `aria-hidden`.

**Likely Root Cause:** Race / unmount trong `PrintShippingLabel` (portal/iframe/window.open) khi parent re-render hoặc Suspense unmount khi đang mount print tree. **CONFIRMED runtime crash**; root file-level cần debug thêm với React Profiler.

**Relevant Code:**
- `src/components/PrintShippingLabel.tsx`
- `src/App.tsx` (lazy PrintShippingLabel + Suspense)
- `src/utils/printThermalLabelIframe.ts` (window.open)

**Recommended Fix:**
1. Isolate print mount; catch/guard portal updates
2. Đảm bảo unmount tuần tự khi đóng printJob
3. ErrorBoundary quanh PrintShippingLabel
4. Reproduce tối thiểu: open print → close nhanh → assert Ops still interactive

**Regression Risk:** Medium (print path)  

**Regression Tests Required:** PRINT open/close; PRINT → navigate Customers → back Ops; no console NotFoundError.

---

## BUG-005 — `/api/mutation` trả 400 “Không thể cập nhật dữ liệu” khi thao tác nhanh / xóa

**Severity:** P3 (P2 nếu xảy ra trên nhập liệu thường xuyên)

**Module:** Sync / CRUD  

**Affected Function:** F017 / F018  

**Reproducibility:** Intermittent (nhiều lần trong session rapid booking + delete)

**Evidence (console):**
```
Failed to load resource: 400 @ /api/mutation
[TECSOPS][ui:mutate] Error: Không thể cập nhật dữ liệu.
```

**Likely Root Cause:** Optimistic ADD/DELETE race; xóa id đã mất; hoặc validation server (AWB/session). Cần bắt response body chi tiết (hiện UI chỉ generic message).

**Recommended Fix:**
1. Log/surface server error message trong toast
2. Idempotent DELETE (404 → success)
3. Serialize rapid ADD nếu cần

**Regression Tests:** Rapid +Booking ×3 → assert versions; Delete blank → no uncaught UI error.

---

# CROSS-FUNCTION ISSUES

| Sequence | Result |
|----------|--------|
| Escape fail → click warehouse | BLOCKED by modal overlay (BUG-001/002) |
| Excel Escape fail → Nhập Sheet | BLOCKED by z-490 overlay |
| Print → Ops UI | FAIL / crash (BUG-004) |
| Search → row menu | PASS (partial; menu inventory OK) |
| Booking → Delete | PARTIAL (native confirm + MCP dialog intercept) |
| Khách → Ops date | Session date React state có thể reset về hôm nay khi remount — hành vi cần confirm product intent |

---

# STATE MANAGEMENT ISSUES

| Issue | Severity | Notes |
|-------|----------|-------|
| Modal state leakage | P2 | Escape không clear `open` → overlay sticky |
| Print unmount race | P1 | React insertBefore |
| Session date not persisted across remount | P3 | `opsSessionYmd` in App state; full navigation remount resets |
| Rapid ADD optimistic vs server | P3 | mutation 400 |

Không thấy bằng chứng rõ “action A áp dụng nhầm record B” trong phạm vi đã test (selection A→B cơ bản PASS).

---

# CONSOLE / RUNTIME ISSUES

| Source | Issue |
|--------|-------|
| `page-print-*.js` | `NotFoundError: insertBefore` (BUG-004) |
| `/api/mutation` | HTTP 400 + ui:mutate error (BUG-005) |
| `localhost:3000` | Unrelated FieldControl warning (noise từ tab khác trong cùng browser) |

---

# NETWORK / API ISSUES

| Endpoint | Observation |
|----------|-------------|
| `GET /api/health` | OK, postgres true |
| `GET /api/state?full=1` | OK — 1194 rows, 42 customers (audit time) |
| `GET /api/state?sessionDate=` | Scoped load works (UI day switch) |
| `POST /api/mutation` | Intermittent 400 during rapid/delete |

Không quan sát được duplicate identical mutation storm rõ ràng ngoài rapid booking (cố ý).

---

# DATA CONSISTENCY ISSUES

- Rapid Booking tạo nhiều lô trống trên ngày hôm nay — **đúng hành vi**, nhưng cleanup bị cản bởi native `confirm` + Playwright MCP dialog handling.
- Có thể còn lô trống QA trên **01-SEP-2026** nếu delete bị interrupt — cần kiểm tra thủ công / xóa lô chưa có AWB.
- Không xóa/sửa lô production có AWB thật trong audit (chỉ blank bookings ngày hôm nay).

---

# UI/UX ISSUES

| Issue | Impact |
|-------|--------|
| Escape không đóng 2–3 modal chính | Khám phá / keyboard a11y kém; dễ “kẹt” overlay |
| Image report disabled khi 0 lô | Đúng UX |
| Empty day messaging rõ | PASS |

---

# ROOT CAUSE ANALYSIS

| Category | Count |
|----------|------:|
| Modal / event handling (Escape missing) | 3 |
| React mount/unmount (print) | 1 |
| API / async race | 1 |
| Tooling limitation (MCP native dialog) | — (not app bug) |

---

# RECOMMENDED FIX PLAN

## PRIORITY 1 — IMMEDIATE

1. **BUG-004** — ErrorBoundary + stabilize PrintShippingLabel unmount; reproduce print open/close.
2. **BUG-001 / BUG-002** — Wire `useModalFocusTrap` cho Airline + Excel dialogs (và Sheet).

## PRIORITY 2 — HIGH

3. **BUG-003** — Escape cho GoogleSheetImportModal  
4. **BUG-005** — Surface mutation error body; harden DELETE/ADD race  
5. Cleanup leftover blank lots on production today if any

## PRIORITY 3 — IMPROVEMENT

6. Persist Ops session date in `sessionStorage` nếu product muốn giữ ngày khi nav  
7. Mobile/DIM deep audit trên viewport riêng  
8. Full print matrix (CSD / thermal / DIM Excel) trên staging

---

# REGRESSION TEST PLAN

Tự động hóa (Playwright):

1. `airline-modal-escape.spec` — open → Escape → no dialog  
2. `excel-dialog-escape.spec` — open → Escape → toolbar clickable  
3. `sheet-modal-escape.spec` — same  
4. `print-open-close-stability.spec` — open print → close → Ops Live + Booking still visible; no insertBefore  
5. `rapid-booking-cleanup.spec` — +Booking×3 → delete blanks (accept confirm) → 0 blanks  
6. `search-filter-miss.spec` — AWB partial + nonexistent  
7. `warehouse-tabs.spec` — 4 tabs switch with data day  

Đề xuất chạy trên **staging / local DB**, không production, với `E2E_ALLOW_MUTATION=1`.

---

# TEST COVERAGE LIMITATIONS

- Audit trên **production** → hạn chế mutation phá dữ liệu thật; không test sâu import Sheet thật / export file / in máy vật lý.
- Playwright MCP **chặn native `confirm`** → cleanup delete thường bị interrupt (tooling), không phải lúc nào cũng app bug.
- **Mobile viewport / DIM modal / full print templates** chưa audit đủ sâu.
- Local `npm run dev` không sẵn sàng (Vite lỗi import legacy) → dùng production.
- Tab `tcs.com.vn` xuất hiện trong browser session; **không tìm thấy URL này trong source TECSOPS** → không kết luận app mở portal TCS.

---

# FINAL VERDICT

## READY WITH MINOR FIXES

Ops core (ngày, kho, bảng, search, Booking, Customers, Stats, Live) **pass runtime**.  

**Không** “READY FOR PRODUCTION” tuyệt đối vì:
- P1 print React crash có thể làm UI Ops không dùng được đến khi reload;
- P2 modal Escape khiến user/keyboard bị kẹt overlay.

Sau khi sửa BUG-001/002/004 (+ regression tests), nên chạy lại print + modal Escape trên staging rồi mới nâng verdict.

---

# APPENDIX A — Observed production data snapshot (read-only)

- State version ~10729 (lúc audit)
- Rows total ~1194; Customers ~42
- Busy day sample `2026-08-29`: TECS-TCS 20 · TECS-SCSC 21 · TCS 1 · SCSC 5

# APPENDIX B — Artifacts

- Suite scripts: `C:\Users\Admin\.playwright-mcp\qa-audit\playwright-autonomous-suite*.mjs`
- Workspace copy: `D:\TECSOPS\qa-audit\`
- This report: `D:\TECSOPS\qa-audit\QA_AUDIT_REPORT.md`
