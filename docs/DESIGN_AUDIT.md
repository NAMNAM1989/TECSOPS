# TECSOPS — UI/UX Design Audit (read-only)

> Ngày khảo sát: **2026-08-23**  
> Phạm vi: frontend sản phẩm (`src/`). **Không** redesign, **không** sửa UI.  
> Đối tượng: design team — báo cáo để hành động.  
> Tài liệu liên quan (không thay thế): `docs/TECSOPS-REDESIGN-AUDIT.md` (2026-07-26), `docs/ui-review.md` (Round 2–3.2), `docs/TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md`.

**Kết luận ngắn:** Hệ thống đã có lớp primitive `src/ui/` và token semantic `ui-*` (Operational Signal Round 2), nhưng màn hình ops thật vẫn là **chrome dày + 4 hệ màu song song + form/modal tự viết**. Ưu tiên redesign theo workflow kho, không theo “làm đẹp toàn app”.

---

## 1. Stack & styling approach

| Lớp | Hiện trạng |
| --- | --- |
| Framework | **React 18.3** + **TypeScript ~5.6** + **Vite 5.4** (`package.json`) |
| Router | **Hash router tự viết** — `src/hooks/useHashRoute.ts`. **Không** React Router / TanStack Router |
| Styling | **Tailwind CSS 3.4** (`tailwind.config.js` + `src/index.css`). Không CSS Modules. Gần như không styled-components |
| Token layers | Tailwind `theme.extend` + class semantic `ui-*` + 3 lớp legacy (`dashboard.*`, `apple.*`, `ops.*`) + file token TS (`src/styles/opsModalStyles.ts`, `src/styles/mobileOpsStyles.ts`, `src/components/portalBarUi.ts`, `src/components/statusStyles.ts`) |
| Icon | **Không** `lucide-react` (skill nội bộ ghi Lucide — **sai so với repo**). Thực tế: ký tự Unicode (`▣ ◎ ▤ ○ ↓`) + SVG inline rải rác (`ShipmentRowActionsMenu`, `NewBookingButton`) |
| Chart | Recharts (`src/components/OpsStatsCharts.tsx`) |
| Font | Google Fonts: **Plus Jakarta Sans** (UI) + **IBM Plex Mono** (AWB / số) — `index.html` |
| Auth shell | `AppAuthGate` bọc toàn app; Toast global ở `src/main.tsx` |
| Breakpoint mobile | `useIsMobile(768)` — `src/hooks/useIsMobile.ts` |
| Print | CSS riêng `src/styles/print-label.css` (tem mm). **Không** nằm trong hệ token UI |

**Layout shells**

```
main.tsx
└── ToastProvider
    └── AppAuthGate                    # login form nếu auth required
        └── AuthenticatedApp           # src/App.tsx
            ├── AppShell (Ops, Stats)  # sticky chrome + max-w-[1600px]
            ├── CustomersPage header   # tự viết, max-w-[1400px], KHÔNG dùng AppShell
            ├── BottomNav              # mobile only, z-[500]
            └── PrintShippingLabel     # overlay state, không phải route
```

- Ops + Stats dùng `AppShell` (`src/ui/AppShell.tsx`).
- Customers **không** dùng AppShell — header sticky riêng (`src/pages/CustomersPage.tsx`).
- Không có sidebar desktop. Điều hướng desktop = nút trong chrome từng trang. Mobile = `BottomNav`.

---

## 2. Route / screen inventory

Hash: `#/` · `#/customers` · `#/stats`. Mọi hash khác fallback về Ops.

| Route | Màn hình | File chính | Vai trò ops |
| --- | --- | --- | --- |
| `#/` | **Ops day board** | `src/components/AirCargoTracking.tsx` (~945 dòng) | Bảng ngày: booking, DIM, status, TCS/eCargo, in tem, Excel, ảnh báo cáo |
| `#/customers` | **Danh bạ KH** | `src/pages/CustomersPage.tsx` (~1235 dòng) | Master data Shipper/CNEE/Goods/Vehicle + Excel 22 cột |
| `#/stats` | **Thống kê** | `src/pages/OpsStatsPage.tsx` (~682 dòng) | KPI / chart / bảng lô theo kỳ |
| *(overlay)* | **In tem** | `src/components/PrintShippingLabel.tsx` | Preview + chọn khổ 100×80 / 100×50 |
| *(gate)* | **Đăng nhập token** | `src/components/AppAuthGate.tsx` | Form mã truy cập Railway |

**Overlay / sheet / modal gắn Ops (không có route riêng)**

| Màn | File | Ghi chú UX |
| --- | --- | --- |
| Sửa lô mobile (sheet) | `src/components/MobileShipmentEditSheet.tsx` | 3 tab: Booking / Thông báo / DIM |
| Nhập DIM | `src/components/MobileDimKgModal.tsx` | **~1690 dòng** — form nặng nhất |
| Cổng TCS / eSID | `src/components/TcsPortalInlineBar.tsx` | Login Ext, Quét, Điền, HOÀN TẤT |
| Cổng eCargo SCSC | `src/components/EcargoScscInlineBar.tsx` + `EcargoVctRegisterModal.tsx` (~1255+ dòng) | Đăng ký VCT |
| Menu hàng lô | `src/components/ShipmentRowActionsMenu.tsx` | In / CSD / ESID / eCargo / xóa |
| In CSD | `src/components/CsdPrintModal.tsx` | Focus trap có |
| Tem hãng | `src/components/AirlineLabelSettingsModal.tsx` | Lazy từ Ops |
| Xuất Excel ngày | `src/components/DayExcelExportDialog.tsx` | Chọn khoảng ngày |
| Xóa khách | `src/components/customerDirectory/CustomerDeleteConfirmModal.tsx` | Gõ mã KH |
| eSID quick-fill từ KH | `src/components/customerDirectory/CustomerEsidQuickFillModal.tsx` | AWB + điền TCS |
| Dirty leave | `src/ui/ConfirmDialog.tsx` | Chỉ Customers (back / discard) |

**Không có:** settings app, user profile, onboarding, dark mode UI (token `ops.*` / `*-dark` còn trong config nhưng `main.tsx` gỡ class `dark`).

---

## 3. Current design tokens

Nguồn sự thật: `tailwind.config.js` + `src/index.css`. **Không** có CSS variables `--color-*` cho product UI (trừ implicit Tailwind).

### 3.1 Semantic `ui.*` (canonical — Round 2)

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `ui.background` | `#E4EBF3` | Canvas |
| `ui.surface` | `#FFFFFF` | Card / bảng |
| `ui.surface-muted` | `#F0F4F8` | Hover / chip idle |
| `ui.text` | `#0B1220` | Body |
| `ui.text-muted` | `#5B6B7C` | Meta |
| `ui.border` | `rgba(15,23,42,0.09)` | Viền |
| `ui.primary` | `#0F766E` | CTA / focus |
| `ui.primary-hover` | `#115E59` | |
| `ui.focus` | `rgba(15,118,110,0.38)` | Ring |
| `ui.success` | `#059669` | |
| `ui.warning` | `#D97706` | |
| `ui.danger` | `#B91C1C` | |
| `ui.info` | `#0369A1` | |
| `ui.navy` | `#0B1220` | Wordmark / KPI |
| `ui.awb` | `#9F1239` | Số AWB (contrast cao) |

### 3.2 Legacy palettes (vẫn trong theme — gây lệch)

| Palette | Ý định cũ | Tình trạng |
| --- | --- | --- |
| `dashboard.*` | Canvas / accent song song `ui.*` | Trùng màu; shadow `dashboard-card` vẫn dùng ở `ConfirmDialog` |
| `apple.*` | Light “iOS” | **Còn sống** trong `ops-grid-*` (`src/index.css`) và gần như toàn bộ `OPS` (`src/styles/opsModalStyles.ts`) |
| `ops.*` | Dark (`#0B0F19` …) | **Chết** — light mode bắt buộc; comment trong `opsModalStyles.ts` vẫn nói “đồng bộ light/dark” |

### 3.3 Typography

| Role | Spec |
| --- | --- |
| UI | Plus Jakarta Sans, `letter-spacing: 0.012em` trên `body` |
| Data / AWB | IBM Plex Mono + `.font-shipment-data` / `.ops-awb` |
| Scale thực tế | **Không có type scale.** Rải `text-[8px]` → `text-[15px]` + `text-xs/sm/base/xl`. Label KPI thường **8–10px uppercase** |

### 3.4 Spacing / radius / shadow

| Loại | Token | Ghi chú |
| --- | --- | --- |
| Spacing | Chỉ scale Tailwind mặc định | Chrome dùng `gap-0.5` / `px-2.5` / `py-0.5` rất dày; không có spacing semantic (`space-page`, `space-field`) |
| Radius | `ui-sm` 8px · `ui-md` 12px · `ui-lg` 16px · `apple` 20px · `apple-lg` 28px · sheet mobile `rounded-t-[28px]` | Primitive `Button`/`Input` = `rounded-xl` (16px), không map `ui-*` |
| Shadow | `ui-sm/md/lg`, `apple` / `apple-md`, `dashboard-card` | 3 họ bóng cho cùng surface trắng |

### 3.5 Status & warehouse (ngoài token `ui`)

`src/components/statusStyles.ts` — 9 trạng thái = 9 màu Tailwind (`blue / amber / cyan / sky / orange / fuchsia / teal / lime / emerald`). Icon Unicode kèm text (tốt hơn chỉ-màu).

`src/components/WarehouseGridPicker.tsx` — 4 kho = `sky / violet / cyan / fuchsia`. Team chip TECS/TCS/SCSC = `teal / sky / violet`.

**Đây là hệ màu thứ 5**, không nằm trong `ui.*`.

### 3.6 Canvas body (`src/index.css`)

Nền không phẳng: radial teal + sky + linear `#e8eef5 → #e4ebf3 → #dde5ef`. Zebra bảng: `#ffffff` / `#f7fafc`. Sticky thead: gradient `#f1f5f9 → #e8eef5`.

---

## 4. Component inventory

### 4.1 Design system `src/ui/` — dùng thật vs chỉ export

| Primitive | File | Mức dùng trên màn hình |
| --- | --- | --- |
| `Button` / `IconButton` | `Button.tsx` | **Có** — Ops chrome, Customers, Stats, một số modal |
| `Input` / `TextArea` / `Select` | `Input.tsx` | **Không** — không page nào import. Form tự copy class `FIELD` / `OPS.input` / `MOBILE.input` |
| `Card` | `Card.tsx` | **Không** — Stats tự viết `KpiCard`; Customers tự viết panel |
| `Badge` | `Badge.tsx` | **Không** — status dùng `StatusSelect`/`StatusPill`; portal dùng `PortalExtStatusChip` |
| `AppShell` / `KpiStat` | `AppShell.tsx` | Ops + Stats. Customers bỏ qua. Mobile Ops dùng `MiniKpi` riêng |
| `BottomNav` | `BottomNav.tsx` | Mobile 3 tab |
| `Wordmark` | `Wordmark.tsx` | Ops / Stats / Auth. Customers chỉ text “Khách hàng” |
| `SyncStatusPill` | `SyncStatusPill.tsx` | 3 trang + mobile sync bar |
| `Toast` / `notify` | `Toast.tsx`, `notify.ts` | Global — Round 3.2 thay `window.alert` (một phần) |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Chỉ dirty-leave Customers |
| `OverflowMenu` | `OverflowMenu.tsx` | Tools / Excel / portal overflow |
| `Banner` / `EmptyState` / `PageSkeleton` | | Có trên Ops / Customers / Stats |

### 4.2 Shared ops components

**Nav / chrome**

- `OpsMobileStickyHeader` + `OpsMobileSyncBar` — header kho điện thoại
- `OpsDatePicker`, `NewBookingButton`, `OpsToolsMenu`, `ChromeExtensionsDownloadMenu`
- `WarehouseGridPicker` — 4 kho
- `SmartSearchBar` — tìm AWB / KH / ngày bay
- `StatusFilterBar` — chip trạng thái + count
- `TcsPortalInlineBar`, `EcargoScscInlineBar`, `PortalExtStatusChip`
- `EsidSettingsMenu` + 3 nút registrant / agent / profile

**Tables / lists**

- `DesktopShipmentTable` — 11 cột, AWB sticky, inline edit
- `MobileShipmentCards` + `StickyMobileActions` (FAB)
- Bảng Stats local (`AggTable`, `LotTable` trong `OpsStatsPage.tsx`)
- List KH (button rows trong `CustomersPage`)

**Forms / inline edit**

- `InlineAwbEdit`, `InlineNumberEdit`, `InlineTextEdit`, `InlineCustomerEdit`
- `InlineCustomerInfoCell`, `InlineConsigneeSelect`, `InlineCneeCell`
- `CustomerPickerField`, `CustomerSuggestDropdown`
- `CustomerValidationField`, `CustomerSavedProfilesEditor`
- `OpsRowNoteControl`

**Modals / popovers / menus**

- Sheet / DIM / CSD / eCargo / Print / Airline / Excel / Delete / Quick-fill (mục 2)
- `CneeDetailPopover`, `SelectableTextWithCopyPopover`
- `ShipmentRowActionsMenu` (icon toolbar + overflow)

**Feedback**

- `StatusBadge.tsx` (`StatusSelect` + `StatusPill`)
- `VehicleTypeMissingBadge`
- Toast / Banner / EmptyState

### 4.3 Duplication (cùng việc, khác skin)

| Việc | Bản A | Bản B / C |
| --- | --- | --- |
| Field input | `src/ui/Input.tsx` | `FIELD` trong `CustomersPage.tsx:89`, `FIELD` trong `OpsStatsPage.tsx:66`, `OPS.input` / `OPS.inputLg`, `MOBILE.input` / `inputHero`, input Auth (`AppAuthGate.tsx:86`) |
| Xác nhận nguy hiểm | `ConfirmDialog` | `window.confirm` (`ShipmentRowActionsMenu.tsx:52`, `TcsPortalInlineBar.tsx:175`, `CustomersPage.tsx:329`, `src/utils/csdForms.ts:560`); `CustomerDeleteConfirmModal` |
| KPI | `KpiStat` (`AppShell.tsx`) | `MiniKpi` (`OpsMobileStickyHeader.tsx:69`); `KpiCard` (`OpsStatsPage.tsx:73`) |
| Nút primary | `Button` | `MOBILE.primaryBtn`; `PORTAL_BAR_UI.btnPrimary`; CTA báo cáo override `bg-emerald-600` / `teal-700` / `sky-600` / `violet-600` (`AirCargoTracking.tsx:680–730`) |
| Menu ⋯ | `OverflowMenu` | Dropdown class trong `OPS.dropdown*` |
| Status chip | `Badge` (unused) | `statusSelectSurface` + `PORTAL_BAR_UI.chipTone` + warehouse chips |

---

## 5. Top UX/UI issues (có path)

Mức: **P0** = cản workflow / a11y rõ · **P1** = lệch hệ thống, redesign sẽ đụng · **P2** = polish.

### P0 — Workflow & accessibility

1. **Chrome Ops desktop quá dày — một hàng làm mọi việc**  
   `src/components/AirCargoTracking.tsx:635–813`  
   Hàng 1: Wordmark + badge OPS + ngày + sync + Booking + Thống kê + **4 CTA ảnh** (Vantage / Tecs / TCS / SCSC, mỗi cái một màu) + Tải Ext + Công cụ + date picker. Hàng 2: KPI + search + status + portal TCS/eCargo.  
   **Tác động:** ops PC khó quét; CTA báo cáo tranh với Booking.  
   **Hướng redesign:** tách “ngày / kho / booking” khỏi “export / portal / tools”. Một primary CTA.

2. **Chrome Ops mobile vẫn chồng lớp dù đã Round 3**  
   `src/components/OpsMobileStickyHeader.tsx` + `OpsMobileSyncBar.tsx` + `BottomNav` + `StickyMobileActions` (`MobileShipmentCards.tsx`)  
   Sync + date + kho chip + search + status + portal thu gọn + FAB + tab bar.  
   **Tác động:** viewport kho 375px mất nhiều hàng trước khi thấy AWB.  
   **Hướng:** 1 hàng identity, 1 hàng search/filter; portal chỉ khi kho TCS/SCSC và đã chọn lô.

3. **`window.confirm` vẫn chặn UI trên đường ops nóng**  
   - Checklist Fill/Register: `src/components/ShipmentRowActionsMenu.tsx:52`  
   - Gửi HOÀN TẤT TCS: `src/components/TcsPortalInlineBar.tsx:175`  
   - Đổi khách khi dirty: `src/pages/CustomersPage.tsx:329` (trong khi leave/discard đã dùng `ConfirmDialog` ở dòng 1207)  
   **Tác động:** native dialog, không brand, khó đọc trên mobile, không log/Toast.  
   **Hướng:** một `ConfirmDialog` (hoặc variant danger) cho mọi confirm phá hủy / gửi cổng.

4. **Z-index không một thang — modal xóa khách có thể chìm dưới BottomNav**  
   - BottomNav `z-[500]` — `src/ui/BottomNav.tsx:32`  
   - Sheet mobile `z-[560]` — `src/styles/mobileOpsStyles.ts:6`  
   - Toast `z-[600]` — `src/ui/Toast.tsx:115`  
   - ConfirmDialog `z-[700]` — `src/ui/ConfirmDialog.tsx:43`  
   - **Delete KH `z-[70]`** — `src/components/customerDirectory/CustomerDeleteConfirmModal.tsx:29`  
   **Tác động:** trên điện thoại, footer xóa / overlay có thể bị tab bar đè.  
   **Hướng:** token z-index (`overlay < sheet < toast < dialog`).

5. **Focus trap không đồng đều**  
   Có `useModalFocusTrap`: `MobileDimKgModal.tsx:608`, `CsdPrintModal.tsx:42`.  
   **Không** thấy trap trên: `ConfirmDialog`, `CustomerDeleteConfirmModal`, `DayExcelExportDialog`, `AirlineLabelSettingsModal`, `CustomerEsidQuickFillModal`, `PrintShippingLabel`, `AppAuthGate`.  
   `ConfirmDialog` chỉ Escape + focus nút Hủy (`ConfirmDialog.tsx:29–36`) — Tab vẫn thoát overlay.  
   E2E axe (`tests/e2e/accessibility.mjs`) chỉ fail **critical**, không bắt contrast / label / focus đầy đủ.

6. **Chữ 8–10px trên nền muted — rủi ro contrast + đọc kho**  
   Ví dụ: KPI label `text-[8px]` (`AppShell.tsx:27`), badge “Ngày khác” `text-[8px]` (`AirCargoTracking.tsx:655`), BottomNav label `text-[10px]` (`BottomNav.tsx:53`), Customers meta `text-[10px]` (`CustomersPage.tsx:738`), type chips `text-[10px] py-0.5` (`CustomersPage.tsx:853`).  
   Active BottomNav: `bg-teal-600/12 text-teal-900` — tint rất nhạt trên canvas `#E4EBF3`.  
   **Hướng:** type scale tối thiểu 11px body / 12px control; kiểm WCAG trên canvas lạnh.

7. **Nhãn trạng thái compact khó đọc**  
   `statusLabelCompact` (`statusStyles.ts:23`): HQ / AN / HT / OLA. Icon Unicode `○ ↓ ▣ ◇ △ ↗ ✓ ⚖ ★` (`statusStyles.ts:36`).  
   **Tác động:** ca mới / giám sát không thuộc TCS dễ nhầm. Màu status (cyan vs sky vs teal) gần nhau.  
   **Hướng:** giữ icon+text; bỏ acronym trừ khi có tooltip bắt buộc; palette status 5–6 bậc, không 9 hue.

### P1 — Hệ thống thiết kế bị phân mảnh

8. **Bốn (năm) hệ màu sống cùng lúc**  
   `ui.*` (canonical) · `apple.*` (OPS modal + grid) · `dashboard.*` · `ops.*` (dead dark) · plus Tailwind raw (`teal-600`, `emerald-600`, `violet-600`…).  
   File điển hình: `src/styles/opsModalStyles.ts` (toàn `apple-*` + `black/[0.08]`), `src/components/AppAuthGate.tsx:71–89` (`slate-*` + `focus:ring-teal-100`), `src/ui/BottomNav.tsx:55` (`teal-*` không `ui-primary`).

9. **Primitive `Input` / `Card` / `Badge` không được dùng**  
   Export ở `src/ui/index.ts:26–28` nhưng grep không thấy import từ pages/components.  
   Redesign nếu chỉ “đẹp token” mà không bắt màn hình dùng primitive thì sẽ lặp Round 2.

10. **Customers lệch shell so với Ops/Stats**  
    Không `AppShell`, max-width 1400 vs 1600, không Wordmark, nút `← Ops` / `← DS`.  
    `src/pages/CustomersPage.tsx:709–826`.  
    Mobile: list/detail 2 pane + Lưu sticky — đã xử lý occlusion (ui-review Round 3.1) nhưng visual language vẫn “admin form”, không “ops board”.

11. **Bảng desktop 11 cột, mật độ cao, edit inline mọi ô**  
    `src/components/DesktopShipmentTable.tsx:69–92` — `# · AWB · CHUYẾN · DST · KIỆN · KG · DIM · KHÁCH · INFO KH · STATUS · actions`.  
    INFO KH cố định `12.5rem` chứa Shipper/CNEE/hàng — dễ overflow. AWB sticky nhưng header tiếng Anh/viết tắt lẫn (`DST`, `STATUS`, `INFO KH`).  
    **Hướng:** cột primary (AWB, chuyến, pcs/kg, status) vs secondary (info KH trong popover đã có `CneeDetailPopover`).

12. **DIM modal là sản phẩm-trong-sản phẩm**  
    `MobileDimKgModal.tsx` ~1690 dòng: banner trạng thái, random fill, template, merge line, SCSC limit, divisor 6000/5000.  
    Visual: nhiều lớp vàng/đỏ ad-hoc (`bg-red-*` count cao trong file).  
    **Hướng:** 2 mode — “đo nhanh 1 dòng” vs “nhiều kiện / template”; không hiện toàn bộ power-user lúc mở.

13. **eCargo / eSID chrome không cùng grammar với Button**  
    Portal: `PORTAL_BAR_UI` (`portalBarUi.ts`) + override emerald (`TcsPortalInlineBar.tsx:53`).  
    Row actions: icon 14px + `OPS.actionIcon*` màu indigo/sky/emerald (`opsModalStyles.ts:67–79`).  
    **Hướng:** một toolbar “Cổng” (Ext status + 1–2 CTA), overflow cho PDF/Điền/CSD.

14. **Auth gate đứng ngoài hệ**  
    `AppAuthGate.tsx:69–89` — `bg-white shadow-xl`, `border-slate-200`, input không `Input`, không `Card`. First impression lệch Ops.

15. **Icon không hệ**  
    Unicode hình học (BottomNav, status) vs SVG stroke 2–2.5 (actions) vs text “⋯”. Không optical size, không a11y name thống nhất (một số nút chỉ title).

### P2 — Nhất quán nhỏ

16. `ConfirmDialog` nút Hủy là `<button>` raw, nút OK là `Button` (`ConfirmDialog.tsx:59–68`).  
17. Stats `KpiCard` dùng gradient amber/teal/sky (`OpsStatsPage.tsx:84–91`) — khác `KpiStat` phẳng.  
18. Chart hex cứng (`OpsStatsCharts.tsx:25–31`) gần token nhưng không import theme.  
19. Ghi chú lưới `text-red-800` (`.ops-grid-note` trong `index.css:68`) — đúng tín hiệu ops, lệch `ui.danger` `#B91C1C`.  
20. Không skip-link; landmark: BottomNav có `aria-label`, Customers header không bọc `<main>` rõ (Ops/Stats nằm trong `AppShell` div).  
21. `StatusFilterBar` `role="tablist"` (`StatusFilterBar.tsx:51`) — cần kiểm arrow-key (pattern tab vs toolbar).  
22. Type filter KH (`py-0.5`) dưới 44px — e2e chỉ đo sticky header Ops, không đo Customers chips.

---

## 6. Recommended redesign order (ops workflows first)

Không redesign “cả app”. Làm theo **màn đụng tay mỗi ca**, mỗi đợt một shell + token đóng.

| # | Màn | Vì sao impact cao | File neo | Việc design nên giao |
| --- | --- | --- | --- | --- |
| **1** | **Ops desktop day board** | 80% thời gian PC kho: sửa AWB, status, DIM, chọn lô | `AirCargoTracking.tsx`, `DesktopShipmentTable.tsx`, `WarehouseGridPicker.tsx`, `StatusFilterBar.tsx` | Information architecture chrome (primary vs tools); cột bảng; hierarchy AWB; gom 4 nút ảnh báo cáo |
| **2** | **Ops mobile day board** | Ca kho / kiểm hàng trên điện thoại | `OpsMobileStickyHeader.tsx`, `MobileShipmentCards.tsx`, `BottomNav.tsx`, `StickyMobileActions` | Giảm chrome; card 2 dòng scannable; FAB vs tab bar; touch 44px thật |
| **3** | **Nhập DIM (modal)** | Điểm sai số + chậm nhất; file lớn nhất | `MobileDimKgModal.tsx` | Wizard đo kiện; trạng thái pcs/kg một banner; ẩn template/random sau “Nâng cao” |
| **4** | **Cổng TCS / eCargo + row actions** | Workflow khai báo — dễ sợ / dễ bấm nhầm | `TcsPortalInlineBar.tsx`, `EcargoScscInlineBar.tsx`, `EcargoVctRegisterModal.tsx`, `ShipmentRowActionsMenu.tsx` | Một pattern “portal ready / login / do action”; thay `window.confirm`; icon toolbar thống nhất |
| **5** | **Danh bạ khách (master-detail)** | Nuôi eSID/eCargo; form dài, lệch shell | `CustomersPage.tsx`, `CustomerSavedProfilesEditor.tsx`, `CustomerEsidQuickFillModal.tsx` | Đưa vào AppShell; dùng `Input`/`Card`; list + 4 tab HS; confirm dirty một kiểu |

**Sau 5 màn trên (không chặn visual system):**

6. In tem preview (`PrintShippingLabel.tsx`) — **chỉ khung UI**; giữ mm/`print-label.css`.  
7. Thống kê (`OpsStatsPage.tsx`) — KPI/chart theo token sau khi Ops ổn.  
8. Auth gate — 1 buổi, map primitive.

**Không làm trước:** dark mode (token `ops.*` chỉ dọn khi đụng file), icon library mới, animation lớn, đổi nghiệp vụ status/kho.

---

## 7. Constraints cho đợt redesign (nhắc design + eng)

Từ spec hiện hữu — audit này **không** nới:

- Giữ hash route 3 trang; không thêm router vì “có thêm màn”.
- Giữ công thức DIM / AWB 11 số / sync WebSocket / Ext TCS+SCSC.
- Tem: không đổi khổ in, `@page`, nội dung bắt buộc.
- Primitive `src/ui/*` nên **bắt đầu được dùng**, không thêm thư viện component.
- Light mode only cho đến khi ops yêu cầu night shift.
- Thay `window.confirm` bằng dialog in-app trên đường nóng (mục 5.3).

---

## 8. Snapshot đo được (để ước effort, không phải timeline)

| Bề mặt | Dòng (xấp xỉ) | Ghi chú |
| --- | --- | --- |
| `MobileDimKgModal.tsx` | 1690 | Ưu tiên #3 |
| `CustomersPage.tsx` | 1235 | Ưu tiên #5 |
| `EcargoVctRegisterModal.tsx` | 1255+ | Gói #4 |
| `AirCargoTracking.tsx` | 945 | Gói #1 chrome |
| `CustomerSavedProfilesEditor.tsx` | 782 | Gói #5 |
| `OpsStatsPage.tsx` | 682 | Để sau |
| `MobileShipmentEditSheet.tsx` | 644 | Đi cùng #2 / #3 |
| `MobileShipmentCards.tsx` | 593 | Gói #2 |
| `DesktopShipmentTable.tsx` | 572 | Gói #1 |
| `src/ui/*` primitives | ~900 | Nền tảng — ít màn dùng hết |

E2E a11y hiện có: `npm run test:e2e:a11y` → `tests/e2e/accessibility.mjs` (axe critical + touch ≥44px trên sticky header Ops). Dùng làm regression, **không** đủ làm definition-of-done visual.

---

## 9. Việc design team có thể làm ngay (không cần code)

1. **Token sheet 1 trang:** chỉ `ui.*` + status 9→nhóm + warehouse 4 màu. Đánh dấu `apple` / `ops` / raw Tailwind là deprecated.  
2. **Wireframe chrome Ops desktop:** 2 hàng tối đa; Booking = primary; Vantage/Tecs/TCS/SCSC vào menu “Báo cáo”.  
3. **Wireframe card lô mobile:** AWB 15–16px mono + status + 1 dòng meta; action trong sheet.  
4. **Flow DIM:** empty → nhập 1 kiện → lưu; nhánh “nhiều kiện”.  
5. **Checklist a11y:** contrast trên `#E4EBF3`, focus ring `ui.focus`, label mọi input (Auth + Customers + DIM), dialog z-index > 500.

---

*Hết audit. Không có thay đổi UI trong PR này.*
