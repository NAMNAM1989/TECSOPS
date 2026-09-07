# TECSOPS — UI/UX Design Audit

> **Phạm vi:** khảo sát read-only, không đổi UI/code sản phẩm.  
> **Baseline:** `f82b1a9` (`origin/main`, 2026-08-23)  
> **Hướng dẫn cho khuyến nghị:** visual hiện đại hơn, trẻ hơn, CTA rõ — *chỉ ghi trong báo cáo, chưa implement*.  
> **Đối tượng:** design team (hành động được), không phải spec kỹ thuật triển khai.

---

## 1. Stack & styling approach

| Lớp | Thực tế trong repo |
| --- | --- |
| Framework | **React 18.3** + **TypeScript ~5.6** + **Vite 5.4** (`package.json`, `vite.config.ts`) |
| Styling | **Tailwind CSS 3.4** utility-first. Không CSS Modules, không styled-components, không shadcn. |
| Global CSS | `src/index.css` (base + utility Ops) · `src/styles/print-label.css` (in tem, ngoài audit visual app) |
| Theme | Light mode chính thức. `darkMode: "class"` nhưng `src/main.tsx` luôn gỡ `.dark`. Token `ops-*` / `*-dark` là leftover. |
| Router | **Hash router tự viết** — `src/hooks/useHashRoute.ts`. **Không** React Router. 3 route: `ops` / `customers` / `stats`. |
| Charts | Recharts (`src/components/OpsStatsCharts.tsx`) |
| Icons | **Không** Lucide / icon set. Unicode (▣ ◎ ▤ ○ ↓) + SVG inline rải rác. |
| UI kit nội bộ | `src/ui/` — Button, AppShell, BottomNav, Toast, ConfirmDialog, … |
| Token ad-hoc | `src/styles/mobileOpsStyles.ts` (`MOBILE`), `src/styles/opsModalStyles.ts` (`OPS`), `src/components/portalBarUi.ts` |

**Cách chạy UI:** `npm run dev` (Vite + API proxy `/api`, `/socket.io` → Express). Breakpoint mobile layout: `useIsMobile(768)`.

**Không có:** design system package, Storybook, Figma token sync, CSS variables (`--color-*`). Token sống trong Tailwind `theme.extend` + class string.

---

## 2. Layout shells

```
main.tsx
  ToastProvider
    App
      AppAuthGate          ← màn login (nếu bật auth)
        AuthenticatedApp
          [route page]
          BottomNav        ← chỉ mobile, z-500
          PrintShippingLabel  ← overlay khi in tem
```

| Shell | File | Dùng ở |
| --- | --- | --- |
| `AppShell` | `src/ui/AppShell.tsx` | Ops, Stats — sticky chrome + `max-w-[1600px]` |
| Header riêng | `src/pages/CustomersPage.tsx` ~711 | Customers **không** dùng AppShell |
| `BottomNav` | `src/ui/BottomNav.tsx` | Mobile 3 tab; ẩn khi `html[data-ops-mobile-overlay=sheet]` |
| `OpsMobileStickyHeader` | `src/components/OpsMobileStickyHeader.tsx` | Chrome Ops mobile (thay header desktop) |
| `StickyMobileActions` | `src/components/MobileShipmentCards.tsx` ~488 | FAB Sửa lô / + Booking trên BottomNav |
| Auth card | `src/components/AppAuthGate.tsx` ~68 | Toàn màn, ngoài AppShell |

**Hệ quả:** 3 trang chính không cùng một chrome. Customers tự sticky header (`z-30`) + Wordmark không thống nhất với Ops/Stats. Mobile có 3 lớp chrome chồng (sticky header + FAB + BottomNav).

---

## 3. Route / screen inventory

Hash: `#/` · `#/customers` · `#/stats`. Mọi path khác → Ops.

### 3.1 Màn chính (lazy trong `src/App.tsx`)

| Route | Màn | File chính | Vai trò ops |
| --- | --- | --- | --- |
| `#/` | **Ops day board** | `src/components/AirCargoTracking.tsx` | Bảng ngày: booking, status, DIM, cổng TCS/eCargo, copy báo cáo, Excel |
| `#/customers` | **Danh bạ KH** | `src/pages/CustomersPage.tsx` | Hồ sơ account + shipper/CNEE/goods/vehicle → eSID |
| `#/stats` | **Thống kê** | `src/pages/OpsStatsPage.tsx` | KPI / chart / Excel theo kỳ · kho · dest |
| *(gate)* | **Login token** | `src/components/AppAuthGate.tsx` | Mã truy cập Railway |
| *(overlay)* | **In tem** | `src/components/PrintShippingLabel.tsx` | Preview + số lượng tem |

### 3.2 Overlay / sheet / dialog gắn Ops (cùng `#/`)

| Màn | File | Ghi chú visual |
| --- | --- | --- |
| Sheet sửa lô (mobile) | `MobileShipmentEditSheet.tsx` | Bottom sheet, z-560, tab Lô / Notify / DIM |
| Modal DIM / volume | `MobileDimKgModal.tsx` (~1690 dòng) | Theme **violet** riêng, dense table |
| Cài tem hãng | `AirlineLabelSettingsModal.tsx` | z-120 |
| Xuất Excel ngày | `DayExcelExportDialog.tsx` | z-490 |
| In CSD | `CsdPrintModal.tsx` | z-130 |
| Đăng ký eCargo VCT | `EcargoVctRegisterModal.tsx` | z-80 — thấp hơn BottomNav |
| Tìm kiếm full-screen (mobile) | `SmartSearchBar.tsx` ~324 | z-520 |
| Menu ESID / agent / registrant | `EsidSettingsMenu.tsx`, `Esid*SettingsButton.tsx` | Dialog nhỏ |
| Popover INFO KH / CNEE | `InlineCustomerInfoCell.tsx`, `CneeDetailPopover.tsx` | z-640 |

### 3.3 Overlay gắn Customers

| Màn | File |
| --- | --- |
| Xóa khách (gõ mã) | `customerDirectory/CustomerDeleteConfirmModal.tsx` |
| Điền eSID nhanh | `customerDirectory/CustomerEsidQuickFillModal.tsx` |
| Confirm dirty leave | `src/ui/ConfirmDialog.tsx` (dùng 2 lần) |

### 3.4 Desktop vs mobile trên Ops

- **Desktop:** header 2 hàng (brand + CTA báo cáo + ngày · KPI + search + status + portal) → `DesktopShipmentTable` (kho picker + bảng inline-edit).
- **Mobile:** `OpsMobileStickyHeader` (sync + kho chip + search + status) → `MobileShipmentCards` → FAB + BottomNav → sheet/modal.

---

## 4. Current design tokens

Nguồn sự thật **khai báo**: `tailwind.config.js` + `src/index.css`.  
Nguồn sự thật **thực tế trên màn**: mix `ui-*` + Tailwind palette (`teal`/`emerald`/`sky`/`violet`/`fuchsia`/`amber`) + object `OPS` / `MOBILE`.

### 4.1 Semantic `ui` (Operational Signal R2 — intended)

| Token | Value | Vai trò |
| --- | --- | --- |
| `ui-background` | `#E4EBF3` | Canvas lạnh |
| `ui-surface` | `#FFFFFF` | Card / bảng |
| `ui-surface-muted` | `#F0F4F8` | Hover / chip idle |
| `ui-text` | `#0B1220` | Body |
| `ui-text-muted` | `#5B6B7C` | Label phụ |
| `ui-border` | `rgba(15,23,42,0.09)` | Viền |
| `ui-primary` | `#0F766E` | Teal CTA |
| `ui-primary-hover` | `#115E59` | |
| `ui-focus` | `rgba(15,118,110,0.38)` | Focus ring |
| `ui-success` | `#059669` | |
| `ui-warning` | `#D97706` | |
| `ui-danger` | `#B91C1C` | |
| `ui-info` | `#0369A1` | |
| `ui-navy` | `#0B1220` | Wordmark / badge trang |
| `ui-awb` | `#9F1239` | Số AWB (contrast cao) |

Canvas body (`src/index.css` ~10–21): radial teal + sky trên gradient `#e8eef5 → #e4ebf3 → #dde5ef`. `theme-color` HTML = `#0F766E`.

### 4.2 Typography

| | |
| --- | --- |
| Sans | **Plus Jakarta Sans** 400–800 (`index.html` Google Fonts) |
| Mono / data | **IBM Plex Mono** — AWB, kg, mã (`font-shipment-data`) |
| Tracking body | `0.012em` |
| Scale thực tế trên Ops | Rất nhỏ: `text-[8px]`–`text-[11px]` cho chip, KPI label, badge «Ngày khác», BottomNav label |

Không có type scale chính thức (display / title / body / caption). Mỗi màn tự chọn `text-[Npx]`.

### 4.3 Spacing / radius / shadow

| | Token | Value / ghi chú |
| --- | --- | --- |
| Radius | `ui-sm/md/lg` | 8 / 12 / 16px |
| | `apple` / `apple-lg` | 20 / 28px — leftover + sheet mobile `rounded-t-[28px]` |
| | Thực tế CTA | `rounded-xl` (12) và `rounded-full` (pill) lẫn |
| Shadow | `ui-sm/md/lg`, `ui-inset` | Navy-tinted, nhẹ |
| | `apple`, `apple-md`, `dashboard-card*` | Cùng lúc vẫn dùng |
| Spacing | Không scale riêng | `gap-1` / `1.5` / `px-2.5` / `py-0.5` dày đặc; chrome cố tình **ép thấp** (Round 3) |

### 4.4 Status & warehouse color (không nằm trong `ui`)

`src/components/statusStyles.ts` — 9 trạng thái × accent trái + pill (`blue / amber / cyan / sky / orange / fuchsia / teal / lime / emerald`).  
`src/components/WarehouseGridPicker.tsx` — 4 kho × `sky / violet / cyan / fuchsia`.  
Báo cáo ảnh Ops desktop: **4 nút primary cùng hàng**, mỗi nút một hue (`emerald / teal / sky / violet`) — `AirCargoTracking.tsx` ~679–729.

### 4.5 Token layers còn sống (inconsistency)

| Layer | File | Tình trạng |
| --- | --- | --- |
| `ui.*` | `tailwind.config.js` | Chuẩn mới — dùng nhiều ở AppShell / Button / Ops chrome |
| `dashboard.*` | cùng file | Vẫn ở Mobile cards (`text-dashboard-primary`) |
| `apple.*` | cùng file | `ops-grid-cell*`, `OPS` modal styles, focus DIM |
| `ops.*` | cùng file | Dark leftover — gần như không mount |
| `OPS` object | `src/styles/opsModalStyles.ts` | Modal xóa KH, print, menu — `apple-*` + violet/sky sections |
| `MOBILE` object | `src/styles/mobileOpsStyles.ts` | Sheet / card / input hero — gần `ui` hơn |
| `PORTAL_BAR_UI` | `src/components/portalBarUi.ts` | Chip + button cổng Ext |
| Raw Tailwind | hầu hết modal DIM / eCargo / login | `slate-*`, `violet-600`, `emerald-600`… |

**Không có CSS variables.** Đổi brand phải tìm class rải.

---

## 5. Component inventory

### 5.1 UI kit (`src/ui/`) — mức dùng

| Primitive | Dùng thật? | Ghi chú |
| --- | --- | --- |
| `Button` / `IconButton` | Có | Ops/Customers/Stats/Auth; nhiều CTA vẫn raw `<button>` |
| `AppShell` / `KpiStat` | AppShell có; **KpiStat gần như không** | Ops desktop KPI là span tự viết |
| `BottomNav` | Có (mobile) | Icon Unicode, không icon set |
| `Wordmark` | Có | TECS + OPS teal |
| `Toast` / `notify` | Có | Thay phần lớn `alert` |
| `Banner` / `EmptyState` | Có | Ops empty; Customers empty list vẫn là `<p>` |
| `OverflowMenu` | Có | Công cụ, Excel, Ext, portal overflow |
| `SyncStatusPill` | Có | |
| `ConfirmDialog` | Customers leave/discard | Cancel là raw button, không `Button` |
| `PageSkeleton` | Có | |
| **`Input` / `TextArea` / `Select`** | **Không import ngoài `ui/index.ts`** | Customers/Stats copy class `FIELD` |
| **`Card`** | **Không dùng** | Customers section tự `rounded-2xl border…` |
| **`Badge`** | **Không dùng** | Status/VCT/kho tự viết pill |

### 5.2 Shared — navigation / chrome

- `Wordmark`, `BottomNav`, `AppShell`
- `OpsDatePicker`, `OpsToolsMenu`, `ChromeExtensionsDownloadMenu`
- `OpsMobileSyncBar`, `OpsMobileStickyHeader`
- `SmartSearchBar`, `StatusFilterBar`, `WarehouseGridPicker`
- `NewBookingButton` (CTA chính — **không** dùng `Button`)

### 5.3 Shared — tables / cards / inline edit

- `DesktopShipmentTable` — bảng dense, AWB sticky, inline edit
- `MobileShipmentCards` + `StickyMobileActions`
- `InlineAwbEdit`, `InlineTextEdit`, `InlineNumberEdit`, `InlineCustomerEdit`
- `InlineCustomerInfoCell`, `InlineCneeCell`, `InlineConsigneeSelect`
- `OpsRowNoteControl`, `CneeDetailPopover`
- `StatusSelect` / `StatusPill` (**file tên** `StatusBadge.tsx` — không export Badge)

### 5.4 Shared — forms

- Customers: `<input>`/`<select>` + `FIELD` (~90) + `CustomerValidationField`
- `CustomerSavedProfilesEditor` — 4 tab hồ sơ mặc định
- DIM: form riêng trong modal (violet)
- Auth: input password raw (`slate` + `teal-600`)

### 5.5 Shared — modals / menus

- `ConfirmDialog` vs `CustomerDeleteConfirmModal` vs `window.confirm` (vẫn còn)
- `ShipmentRowActionsMenu` — In / eCargo / CSD / Xóa / portal
- Portal: `TcsPortalInlineBar`, `EcargoScscInlineBar`, `PortalExtStatusChip`
- `EsidSettingsMenu` + 3 settings button

### 5.6 Shared — feedback

- Toast (chuẩn), Banner, EmptyState
- `VehicleTypeMissingBadge`
- Progress bar DIM (`amber-400` / `emerald` / `red`)

---

## 6. Top UX/UI issues (kèm path)

Sắp theo **tác động visual / ops**, không theo độ khó code.

### P0 — CTA cạnh tranh & chrome quá tải (Ops desktop)

**Vấn đề:** Hàng 1 header Ops đặt **một lúc** Wordmark, badge OPS, ngày, sync, **+ Booking**, Thống kê, **4 nút primary màu khác** (Vantage / Tecs / TCS / SCSC), Tải Ext, Công cụ, date picker.

- `src/components/AirCargoTracking.tsx` ~635–743  
- Nút báo cáo **override** `Button variant="primary"` bằng `bg-emerald-600` / `teal-700` / `sky-600` / `violet-600` (~682–721) → primary brand `#0F766E` mất vai trò “một CTA”.

**Tác động:** Không có điểm nhấn. Ops mới / ca trẻ khó biết việc tiếp theo (+ Booking vs copy ảnh vs portal).

### P0 — Type quá nhỏ, khó quét trên kho

**Vấn đề:** Chip / KPI label / BottomNav / badge ngày dùng `8–10px`.

- `AppShell.tsx` `KpiStat` label `text-[8px]` (~27)  
- `AirCargoTracking.tsx` badge «Ngày khác» `text-[8px]` (~655)  
- `BottomNav.tsx` label `text-[10px]` (~53)  
- `OpsMobileStickyHeader.tsx` `MiniKpi` `text-[9px]` (~72)  
- `CustomersPage.tsx` type chip `text-[9px]` (~892)

**Tác động:** Contrast + độ đọc kém trên máy tính kho / nắng / zoom 100%. WCAG caption thường ≥ 12px / 14px body.

### P0 — Token & visual language bị phân mảnh

Bốn “hệ” cùng lúc:

1. Teal/navy `ui-*` (chrome mới)  
2. Rainbow status + kho (cố ý, nhưng không documented)  
3. **Violet = DIM** (`MobileDimKgModal.tsx` ~484, ~1163, ~1190)  
4. **Emerald = eCargo / success submit** (`TcsPortalInlineBar.tsx` ~53, `EcargoVctRegisterModal.tsx` ~1277)

`OPS` (`opsModalStyles.ts`) vẫn `apple-*` + section violet/sky — lệch AppShell.

**Tác động:** Redesign từng màn sẽ “vá” nếu không chốt 1 token sheet trước.

### P1 — Primitive kit bỏ không, class nhân bản

- `Input` / `Card` / `Badge` **zero consumer**.  
- `FIELD` copy gần giống `Input` BASE:  
  - `CustomersPage.tsx` ~89–90  
  - `OpsStatsPage.tsx` ~66–67  
- `NewBookingButton.tsx` ~30–34 tự viết primary (đúng token, sai primitive).  
- `MOBILE.primaryBtn` / `PORTAL_BAR_UI.btnPrimary` = Button lần 3–4.

**Tác động:** Spacing/radius/focus không ổn định khi redesign CTA.

### P1 — Customers lệch shell & hierarchy

- Không `AppShell`; header `z-30` vs Ops `z-40` (`CustomersPage.tsx` ~711 vs `AppShell.tsx` ~15).  
- Title text, không Wordmark + pill.  
- Desktop: Lưu/Hủy trên header; mobile: sticky footer Lưu/Hủy **và** BottomNav (`~1149`) — hai hàng CTA.  
- Empty list: `<p>` (~910) không `EmptyState`.  
- Form card tự viết (~962) không `Card`.

### P1 — DIM modal là “app trong app”

`MobileDimKgModal.tsx` (~1690 dòng): tab violet/emerald, slider, template, progress, bảng kiện. Không `Button`/`Input` kit. z-560 (đúng trên BottomNav) nhưng visual **tím** lệch teal ops.

**Tác động:** Workflow đo volume (ops hàng ngày) trông như sản phẩm khác.

### P1 — Portal / row actions: CTA quan trọng lẫn overflow

- Login TCS đã có helper `tcsLoginCtaLabel` (copy đầy đủ — tốt).  
- Compact mobile **thu gọn cổng** (`TcsPortalInlineBar` `compact` + `isMobile`) — đúng mật độ, dễ **lạc CTA** khi Ext fail (đã vá một phần ở `ui-review.md`).  
- `ShipmentRowActionsMenu.tsx` ~52: **`window.confirm`** checklist Fill — blocking, không Toast/ConfirmDialog.  
- Cùng file: nút eCargo `bg-emerald-50` (~425) cạnh icon SVG nhỏ `h-3.5`.

### P1 — Z-index không có thang

| Layer | z | Rủi ro |
| --- | --- | --- |
| eCargo modal | 80 | Dưới BottomNav 500 — mobile có thể bị nav đè |
| OverflowMenu | 80 | |
| Print label | 100 | |
| Airline labels | 120 | |
| CSD print | 130 | |
| Excel range | 490 | |
| BottomNav | 500 | |
| Search overlay | 520 | |
| DIM / edit sheet | 560 | |
| Toast | 600 | |
| CNEE popover | 640 | |
| ConfirmDialog | 700 | |
| Xóa khách | **70** | Thấp nhất — dễ bị đè |

### P2 — Accessibility

**Đã tốt:** `:focus-visible` global (`index.css` ~30); nhiều `aria-label` / `role="dialog"`; axe e2e critical gate (`tests/e2e/accessibility.mjs`); touch ≥44px trên sticky header (test); status có icon + text (`statusStyles.ts`).

**Còn lệch:**

| Issue | Evidence |
| --- | --- |
| Contrast chữ 8–10px muted trên canvas lạnh | KPI / BottomNav / chips |
| `text-amber-400` progress (`MobileDimKgModal.tsx` ~164) trên `slate-100` — vàng nhạt | |
| BottomNav active `bg-teal-600/12` + `text-teal-900` (~55) — tint rất nhẹ | |
| Icon-only + Booking mobile có `aria-label`; desktop + Booking **không** (`NewBookingButton.tsx` ~30) | |
| `window.confirm` / `window.confirm` dirty Customers ~329 — native, không focus trap | |
| Confirm xóa khách z-70, không chắc focus trap như `ConfirmDialog` | |
| Stats period `role="tablist"` nhưng control là filter chips (`OpsStatsPage.tsx` ~416) — pattern tab vs filter lẫn | |
| Một số nút `focus:outline-none` mà thiếu `focus-visible:ring` (nút «Xóa» filter ~789, compact × ~102) | |
| `html lang="vi"` OK; không `prefers-reduced-motion` cho toast/sheet | |

### P2 — Iconography & “cảm giác già”

Unicode hình học (▣ ◎ ▤, status ○↓▣◇) + nhãn uppercase 8–10px + navy badge = **ops dashboard 2018**, không phải product 2026. Skill nội bộ từng ghi Lucide — **không có trong `package.json`**.

### P2 — Confirm / destructive không một pattern

- `ConfirmDialog` (Customers leave)  
- `CustomerDeleteConfirmModal` (gõ mã — đúng destructive)  
- `window.confirm` row actions + portal TCS + `csdForms.ts` + đổi khách dirty  

### P2 — Stats ổn hơn nhưng KPI tone ad-hoc

`KpiCard` local (`OpsStatsPage.tsx` ~73) — gradient amber/teal/sky, không dùng `Card` / `KpiStat`. Chart Recharts default-ish. Ít cạnh tranh CTA hơn Ops (một primary: Xuất Excel) — **tham chiếu hierarchy tốt**.

---

## 7. Recommended redesign order (ops first)

Ưu tiên màn **ops đụng mỗi giờ**, rồi hệ thống token, rồi màn hỗ trợ.

| # | Màn | Vì sao | File neo |
| --- | --- | --- | --- |
| **1** | **Ops desktop day board** | 80% thời gian PC kho: bảng + chrome + CTA | `AirCargoTracking.tsx`, `DesktopShipmentTable.tsx`, `WarehouseGridPicker.tsx`, `StatusFilterBar.tsx` |
| **2** | **Ops mobile day board** | Cùng workflow, chrome 3 lớp + card lô | `OpsMobileStickyHeader.tsx`, `MobileShipmentCards.tsx`, `MobileShipmentEditSheet.tsx`, `BottomNav.tsx` |
| **3** | **DIM / volume** | Nhập số nặng, theme lệch, file khổng lồ | `MobileDimKgModal.tsx` |
| **4** | **Portal + row actions** | CTA nghiệp vụ (Login TCS, Quét, Điền, eCargo, In) đang lẫn màu/overflow | `TcsPortalInlineBar.tsx`, `EcargoScscInlineBar.tsx`, `EcargoVctRegisterModal.tsx`, `ShipmentRowActionsMenu.tsx` |
| **5** | **Customers directory** | Nguồn eSID/booking; form dài, shell lệch | `CustomersPage.tsx`, `CustomerSavedProfilesEditor.tsx`, `CustomerEsidQuickFillModal.tsx` |

**Tiếp theo (không top 5):** Print preview (`PrintShippingLabel.tsx` — **không đổi geometry tem**), Stats polish, Auth gate visual, token consolidation (prereq kỹ thuật cho cả 5).

**Nguyên tắc đợt 1 (khuyến nghị, chưa làm):**  
Chốt **1 primary CTA / context** trước khi đổi palette. Ops: `+ Booking`. DIM: `Lưu số đo`. Portal: `Đăng Nhập TCS` *hoặc* `Quét` tùy state. Customers: `Lưu`. Mọi thứ còn lại → secondary / overflow.

---

## 8. Hướng modern / younger / clear-CTA — map lên UI hiện tại

*Chỉ khuyến nghị. Không implement trong PR này.*

Hệ hiện tại («Operational Signal») đã có nền tốt: teal `#0F766E`, surface trắng, AWB đỏ đậm, Plus Jakarta + Plex Mono, light-only. Cảm giác **già / nặng** đến từ **mật độ chrome, type 8px, rainbow CTA, icon Unicode**, không phải từ việc thiếu token.

### 8.1 Clear CTA (ưu tiên cao hơn “trẻ hóa màu”)

| Context | Giữ / nâng | Demote |
| --- | --- | --- |
| Ops desktop | `+ Booking` = primary duy nhất (đã đúng màu `ui-primary`) | 4 nút copy ảnh → 1 «Báo cáo» + menu (như Công cụ) |
| Ops mobile | FAB `Sửa lô` khi có chọn; không chọn → `+ Booking` | ⋯ destructive; portal gọn 1 CTA login khi cần |
| DIM | Một nút Lưu / Áp dụng nổi, teal — bỏ violet primary | Template / slider = secondary |
| Portal | Một nút verb đầy đủ («Đăng Nhập TCS») | Chip status không cạnh tranh kích thước |
| Customers | `Lưu` luôn cùng vị trí; mobile: một hàng footer, không đè BottomNav | Import/Export/Mẫu → overflow (mobile đã vậy) |

### 8.2 Younger visual — map token, không thay nghiệp vụ

| Hướng | Map lên cái đang có |
| --- | --- |
| Sáng hơn, ít “navy institutional” | Giữ canvas lạnh; **giảm badge navy** (OPS / Thống kê); Wordmark đủ brand |
| Type trẻ hơn | Jakarta đã hiện đại — **lên 1 bậc**: caption ≥ 11–12px, body ≥ 14px, AWB giữ mono lớn. Bỏ `text-[8px]` |
| Icon thống nhất | Thay ▣◎▤ bằng 1 set (Lucide hoặc SVG 24). Status: giữ chữ + chấm màu, bớt ký tự hình học |
| Bo & bóng | Đã có `rounded-xl` + `shadow-ui-*` — dùng nhất quán; sheet 28px OK (mobile-native) |
| Màu kho / status | Giữ **ý nghĩa ops** (4 kho, 9 status) nhưng **giảm saturation** trên chrome; rainbow chỉ trên data, không trên 4 CTA báo cáo |
| DIM | Kéo về `ui-primary` / `ui-info`, bỏ theme violet tách biệt |
| Motion | Giữ toast 200ms / sheet slide — thêm reduced-motion; không intro nặng |

### 8.3 Việc *không* làm trong visual pass

- Không đổi cột bảng, công thức DIM, protocol Ext, kích thước tem.  
- Không dark mode (đã chốt light).  
- Không thêm sidebar nếu BottomNav + hash 3 trang đủ — có thể **thêm top nav desktop** (Ops / Khách / Thống kê) để bỏ nút «← Ops» / «Thống kê» rải header.

### 8.4 Design-system homework trước khi vẽ màn

1. Một file token: chỉ `ui.*` + status + warehouse (deprecate `apple` / `dashboard` / `OPS` sau khi migrate).  
2. Bắt buộc `Button` / `Input` / `Card` / `Badge` — xóa `FIELD` song song.  
3. Thang z-index (`z-nav` 500, `z-sheet` 560, `z-modal` 600, `z-toast` 650).  
4. CTA recipe: 1 primary / 1 secondary / overflow.  
5. Type ramp: 12 / 14 / 16 / 20 / 28 + mono 13/15 cho AWB.

---

## 9. Tài liệu liên quan (không thay audit này)

- `docs/ui-review.md` — changelog Round 2–3.2 (đã làm: token R2, toast, mobile chrome).  
- `docs/TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md` — spec nâng cấp cũ (Operational Signal).  
- Audit redesign 2026-07 (`TECSOPS-REDESIGN-AUDIT.md`) đã gỡ ở cleanup B2 — **báo cáo này là bản đồ hiện tại**.

---

## 10. Success check (audit)

- [x] Stack & styling  
- [x] Route / screen inventory  
- [x] Tokens  
- [x] Component inventory  
- [x] UX/UI issues + path  
- [x] Thứ tự redesign (5 màn ops-first)  
- [x] Hướng modern / younger / clear-CTA — khuyến nghị only  
- [x] Không sửa UI code  
