# TECSOPS — Phương án gỡ bỏ và sửa

> Đi kèm Phase 0: `docs/TECSOPS-REDESIGN-AUDIT.md`.  
> Chưa triển khai. Chọn **một gói** (A / B / C) rồi mới sửa code.  
> Base hiểu biết: `main` @ `04a5f43` (#68) + audit PR.

**Khuyến nghị mặc định: Gói B.**

Không đụng trong mọi gói: Ext protocol, schema/DB, công thức DIM, enum workflow, layout in tem (`@page`/mm), CTA «Đăng Nhập TCS», mã kho 4 giá trị, IMAP eCargo, payload eSID.

---

## 1. Ba gói chọn

| | Gói A — An toàn | Gói B — Khuyến nghị | Gói C — Tối đa |
|---|---|---|---|
| Mục tiêu | Sửa lệch visual spec, 0 thay đổi tương tác | A + bỏ `window.confirm` + kit form | B + quét token cũ + auth API + chunk |
| Rủi ro hồi quy | Thấp | Trung — dialog confirm phải giữ copy | Cao hơn — API + nhiều file style |
| PR ước lượng | 1 | 3 | 5–6 |
| Khi nào chọn | Muốn thấy UI phẳng ngay | Vận hành kho + UX không block | Có cửa sổ QA đầy đủ |

```
Gói A ⊂ Gói B ⊂ Gói C
```

---

## 2. Hạng mục GỠ

Mỗi dòng: hiện trạng → phương án → chọn.

### 2.1 Đã gỡ — không làm lại

| Hạng mục | Bằng chứng | Phương án |
|---|---|---|
| `HoverMagnifyText` / CNEE magnify | 0 file | **GIỮ đã gỡ** |
| Speech / mic / voice bar | 0; CSP `microphone=()` | **GIỮ đã gỡ** |
| `StickyMobileActions` | FAB `OpsMobileBookingFab` (#63) | **GIỮ đã gỡ** — spec §5.5 bảo “giữ” là lỗi thời |
| `GoogleSheetImportModal` / Gemini / `/api/sheets` | A3 teardown | **GIỮ đã gỡ** |
| Python Playwright / `/tcs-agent` | A3 | **GIỮ đã gỡ** |
| Ext legacy `chrome-extension/` | A2 | **GIỮ đã gỡ** |

**Không khôi phục** trừ khi user ra lệnh rõ.

### 2.2 Blur header / chrome — GỠ class

| File | Class |
|---|---|
| `src/ui/AppShell.tsx:15` | `backdrop-blur-[6px]` + `bg-ui-background/95` |
| `src/ui/BottomNav.tsx:32` | `backdrop-blur-[8px]` + `bg-ui-surface/95` |
| `src/pages/CustomersPage.tsx:711` | `backdrop-blur-[6px]` + `bg-ui-surface/95` |

| Phương án | Việc | Rủi ro |
|---|---|---|
| **A1 (chọn)** | Xóa `backdrop-blur-*`. Đổi nền `/95` → đặc `#E4EBF3` / `#FFFFFF` + `border-b` | Thấp — spec §4.1 |
| A2 | Giữ blur, chỉ tăng opacity | Lệch spec, không nên |

Thuộc **Gói A**.

### 2.3 `window.confirm` — GỠ native, SỬA bằng dialog

| Chỗ | Copy hiện tại | Vì sao phải sửa |
|---|---|---|
| `CustomersPage.tsx:329` | «Có thay đổi chưa lưu. Đổi khách sẽ hủy thay đổi?» | Dirty guard; đã có `ConfirmDialog` cùng trang |
| `ShipmentRowActionsMenu.tsx:52` | Checklist thiếu chuyến/DEST/PCS/KG/mã KH trước Fill/Register | Chặn UI trước eSID/eCargo |
| `TcsPortalInlineBar.tsx:175` | «Gửi HOÀN TẤT lên TCS… Không hoàn tác từ Ops.» | Hành động không hoàn tác |
| `csdForms.ts:560` | «Vẫn in CSD với Contents trống?» | In phiếu cân — logic `allowEmptyGoods` giữ nguyên |

| Phương án | Việc | Rủi ro |
|---|---|---|
| **B1 (chọn)** | Thay 4 chỗ bằng `ConfirmDialog` (danger cho HOÀN TẤT / xóa). Giữ nguyên câu chữ. `csdForms` nhận `onConfirmEmptyGoods` từ modal, không gọi `window.confirm` trong util | Trung — phải test 4 luồng |
| B2 | Chỉ Customers + CSD; portal giữ native | Nửa vời |
| B3 | Bỏ confirm, Toast + nút | Nguy hiểm (HOÀN TẤT / in trống) — **không chọn** |

Thuộc **Gói B**. Không gộp với gỡ blur nếu muốn review riêng.

### 2.4 Token `apple` / `dashboard` / `ops` — GỠ dần, không xóa Tailwind một phát

`apple-*` còn ở: `opsModalStyles.ts` (nguồn), inline edit, CSD/Airline/Print modal, `CustomerSuggestDropdown`, `index.css` (`.ops-grid-cell*`), `MobileShipmentEditSheet`.

`dashboard-*` còn ở `MobileShipmentCards` + `ConfirmDialog` (`shadow-dashboard-card`).

| Phương án | Việc | Rủi ro |
|---|---|---|
| **A3 / B2a (chọn từng lớp)** | Đợt 1: map `OPS.*` trong `opsModalStyles.ts` sang `ui-*` (một file, mọi modal hưởng). Đợt 2: inline `apple-blue` → `ui-primary`. Đợt 3: xóa key Tailwind `apple`/`dashboard`/`ops` khi grep = 0 | Trung nếu gộp 1 PR |
| C1 | Xóa 3 palette Tailwind ngay + sửa hết class | Cao — dễ sót test visual |
| Giữ | Không làm | Nợ design kéo dài |

Thuộc **Gói A (chỉ `OPS` map)** hoặc **Gói C (xóa palette)**.

### 2.5 Alias / type chết — GỠ khi an toàn

| Hạng mục | Phương án GỠ | Phương án GIỮ | Chọn |
|---|---|---|---|
| `export const CustomerSavedProfilesEditor = CustomerDefaultDataEditor` | Xóa alias + đổi tên file → `CustomerDefaultDataEditor.tsx` sau khi grep 0 | Giữ alias deprecated | **GIỮ alias** đến Gói C |
| `executor: "playwright"` trên preview eSID | Xóa union, chỉ `"extension"` | Giữ — type sống, CLEANUP_REPORT cấm rewrite hook | **GIỮ** |
| Channel `tecsops-tcs-ext` (listen) | Ngừng lắng nghe | Giữ cho máy Ext unpacked cũ | **GIỮ** — protocol |
| Kit `Input`/`Card`/`Badge` chưa dùng | Xóa file | Adopt rồi mới tính xóa | **Không xóa** — adopt ở mục 3 |

### 2.6 Cấm gỡ (dù spec cũ bảo gỡ)

| Hạng mục | Lý do | Nếu user vẫn muốn gỡ |
|---|---|---|
| `CustomerDefaultDataEditor` (4 tab shipper/CNEE/goods/vehicle) | Cấp dữ liệu in tem + eSID | Phải tách «Dữ liệu mặc định» 1–1 rồi mới ẩn UI — PR riêng, test in + Fill |
| Workflow 9 mã lịch sử `CUSTOMS`/`SECURITY`/`COMPLETED` | Có dữ liệu cũ | Chỉ ẩn filter (đã làm) |
| Mã kho `TECS-TCS` / `TECS-SCSC` | DB + Ext channel | Không |

---

## 3. Hạng mục SỬA (không gỡ chức năng)

### 3.1 Form kit — SỬA trùng

`CustomersPage` và `OpsStatsPage` mỗi nơi một `const FIELD = "…"` gần giống `src/ui/Input.tsx` BASE.

| Phương án | Việc | Rủi ro |
|---|---|---|
| **B3 (chọn)** | Thay `<input className={FIELD}>` bằng `<Input />` / `<Select />` / `<TextArea />`. Không đổi validation/save | Thấp |
| B3− | Chỉ Customers | Nợ Stats |
| C2 | Viết thêm `NumberInput`/`SearchInput`/`Combobox` spec §4.4 | Scope phình — để sau |

Thuộc **Gói B**.

### 3.2 Badge / Card — SỬA ad-hoc

Customers dùng `<span className="rounded-full bg-teal-50…">` cho loại KH. Stats có `KpiCard` riêng (gradient) trong khi `KpiStat` đã dùng ở Ops.

| Phương án | Việc |
|---|---|
| **B4** | Customers: `Badge` cho type/profile. Stats: **giữ `KpiCard`** (nhiều tone hơn Ops) — không ép một component |
| C3 | Stats cũng chuyển `Card` + `KpiStat` | Mất hierarchy trang thống kê |

Thuộc **Gói B** (chỉ Customers badge).

### 3.3 Lookup / eCargo auth — SỬA server

`registerLookupRoutes` và `registerEcargoVctRoutes` **không** `requireAuth`. State/mutation thì có.

| Phương án | Việc | Rủi ro |
|---|---|---|
| **C4 (PR riêng)** | Gắn `appAuth.requireAuth` giống `/api/state`. Test Ext + OTP | Trung — Ext/web phải gửi cookie/token |
| C4− | Chỉ lookup; eCargo để sau | OTP vẫn hở |
| Hoãn | Ghi nhận, không vá trong visual | Rủi ro bảo mật giữ nguyên |

**Không thuộc Gói A/B.** Làm Gói C hoặc ticket bảo mật tách.

### 3.4 Bảng Ops — SỬA tăng tốc, không virtualize

Hiện có: search, filter status, sticky AWB, row select, empty khi lọc, hover edit.

| Phương án | Việc | Rủi ro |
|---|---|---|
| **Hoãn** | Không sort/bulk/virtualize đến khi đo ngày > ~200 lô | — |
| B5 | Sort AWB + kg (click thead), giữ tab-order inline | Trung — dễ phá focus lưới |
| C5 | Column visibility + bulk status | Cao — UX kho phức tạp |

Khuyến nghị: **không làm trong Gói A/B**.

### 3.5 Chunk Stats / PDF — SỬA perf

`OpsStatsPage` 442 kB (recharts); `PDFButton` 1 MB đã lazy theo print.

| Phương án | Việc |
|---|---|
| **C6** | `lazy()` `OpsStatsCharts` trong `OpsStatsPage` | Thấp |
| C7 | `npm audit fix` không `--force` | Trung — lockfile |
| Hoãn | Cảnh báo Vite đã chấp nhận | Gói A/B |

### 3.6 Spec / docs — SỬA chữ

`TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md` vẫn bảo giữ Sheet, giữ StickyMobile, gỡ SavedProfilesEditor.

| Phương án | Việc |
|---|---|
| **B0** | Thêm mục «Lệch code 2026-08-23» trỏ audit + options (không viết lại 50 hạng mục) | Đã có 1 dòng Phase 0 |
| C8 | Sửa từng §5.5 / §5.8 / §5.11 | Dễ conflict với bảng nguồn Excel |

---

## 4. Lộ trình nếu chọn Gói B

| PR | Việc | File chính | Verify |
|---|---|---|---|
| B-1 | Gỡ blur 3 chrome + map `OPS` → `ui-*` | `AppShell`, `BottomNav`, `CustomersPage` header, `opsModalStyles.ts` | typecheck, lint, test UI kit, visual chrome |
| B-2 | 4 `window.confirm` → `ConfirmDialog` | Customers, RowActions, TcsPortal, `csdForms` + CSD modal | test Customers dirty; CSD empty goods; không gửi HOÀN TẤT khi Hủy |
| B-3 | Adopt `Input`/`Select`/`TextArea` + `Badge` Customers | `CustomersPage`, `OpsStatsPage` | test validation/save khách; Stats filter |

Mỗi PR: không đụng Ext/print mm/DIM/workflow. Commit nhỏ, có thể revert từng PR.

---

## 5. Lộ trình Gói A (nếu muốn nhỏ hơn)

Chỉ PR B-1 (blur + `OPS` token). Dừng. Confirm + kit để lần sau.

---

## 6. Lộ trình Gói C (sau B)

1. Grep `apple-`/`dashboard-`/`ops-` = 0 rồi xóa palette Tailwind.
2. Đổi tên file editor; xóa alias `CustomerSavedProfilesEditor`.
3. `requireAuth` lookup + eCargo (kèm test Ext).
4. Lazy charts Stats.
5. Sort bảng — chỉ khi user xác nhận ngày đông.

---

## 7. Quyết định cần từ user

Trả lời một dòng là đủ:

- **«Gói B»** — làm B-1 → B-2 → B-3.
- **«Gói A»** — chỉ blur + token `OPS`.
- **«Gói C»** — B rồi tiếp auth API + quét token.
- **«B + C4»** — B rồi vá auth API, chưa xóa palette.

Câu hỏi phụ (chỉ nếu không im lặng = mặc định):

1. Sheet/Gemini: mặc định **không khôi phục**.
2. DefaultDataEditor: mặc định **KEEP**.
3. Channel Ext cũ `tecsops-tcs-ext`: mặc định **KEEP listen**.
