# Báo cáo rà soát UI — TECSOPS Ops Air Cargo (web)

**Phạm vi:** chỉ giao diện web (`src/`), không đổi stack / credentials.  
**Stack thực tế (đã verify):** React 18 + Vite + TypeScript + Tailwind — **không** phải Next.js. Định tuyến hash nhẹ (`useHashRoute`).  
**Ngày review:** 2026-08-22  
**Nhánh:** `cursor/ui-review-web-5f53`

---

## 1. Bản đồ màn hình / route

| Hash | Route | Component | Vai trò |
|------|-------|-----------|---------|
| `#/` | `ops` | `AirCargoTracking` | Bảng điều khiển ngày: lô theo kho, portal TCS/eCargo, in tem |
| `#/customers` | `customers` | `CustomersPage` | Danh bạ KH + hồ sơ eSID (shipper/cnee/goods/vehicle) |
| `#/stats` | `stats` | `OpsStatsPage` | KPI / biểu đồ / bảng chi tiết theo kỳ |
| (overlay) | — | `PrintShippingLabel` | In tem nhiệt (lazy từ Ops) |

**Vỏ app:** `App` → `AppAuthGate` → `AuthenticatedApp` + `Suspense`/`PageSkeleton`.

```
App (#/)
├── AppAuthGate          # mã truy cập Railway (nếu bật)
└── AuthenticatedApp
    ├── ops → AirCargoTracking (+ PrintShippingLabel)
    ├── customers → CustomersPage
    └── stats → OpsStatsPage
```

### Ops — desktop vs mobile

| | Desktop (`md+`) | Mobile (`≤767`, `useIsMobile`) |
|--|-----------------|--------------------------------|
| Chrome | Header inline trong `AirCargoTracking` | `OpsMobileStickyHeader` |
| Danh sách | `DesktopShipmentTable` | `MobileShipmentCards` |
| Chỉnh lô | Inline cells trên lưới | `MobileShipmentEditSheet` (+ `MobileDimKgModal`) |
| CTA đáy | — | `StickyMobileActions` (Sửa lô / + Booking) — **không** bottom-tab điều hướng |

**Kho:** `TECS-TCS` · `TECS-SCSC` · `TCS` · `SCSC` — `WarehouseGridPicker` + `constants/warehouses.ts`.

**Stage workflow (TCS family):** Booking → Nhận → Volume → OLA → HT → Tờ cân  
(`statusStyles.ts` + `shipmentWorkflowStatus`). SCSC/TECS-SCSC **bỏ** bước HT (`RECEPTION_COMPLETED`).

### Component UI chính (file)

| Nhóm | Files |
|------|-------|
| Ops hub | `AirCargoTracking.tsx`, `DesktopShipmentTable.tsx`, `MobileShipmentCards.tsx`, `OpsMobileStickyHeader.tsx` |
| Status | `StatusBadge.tsx` (`StatusSelect`), `StatusFilterBar.tsx`, `statusStyles.ts` |
| Portal | `TcsPortalInlineBar.tsx`, `EcargoScscInlineBar.tsx`, `EcargoVctRegisterModal.tsx` |
| Mobile edit | `MobileShipmentEditSheet.tsx`, `MobileDimKgModal.tsx` |
| Search / tools | `SmartSearchBar.tsx`, `OpsToolsMenu.tsx`, `NewBookingButton.tsx`, `OpsDatePicker.tsx` |
| Customers | `pages/CustomersPage.tsx`, `customerDirectory/*` |
| Stats | `pages/OpsStatsPage.tsx`, `OpsStatsCharts.tsx` |
| UI kit | `ui/AppShell`, `Button`, `Banner`, `EmptyState`, `Skeleton`, `Toast`, `SyncStatusPill`, `Wordmark` |

---

## 2. Đánh giá UX/UI (tóm tắt)

**Điểm mạnh**

- Token semantic rõ (`ui-*`), light mode chính thức, font Plus Jakarta + IBM Plex Mono cho AWB (`font-shipment-data`).
- AWB được ưu tiên đọc: sticky cột desktop, `tabular-nums`, mobile `MOBILE.awb` 15px extrabold, không truncate số.
- Empty/loading: `EmptyState` ngày trống, `PageSkeleton` Suspense, `Banner` offline, `SyncStatusPill`.
- Mobile có touch target ~44px (`min-h-11`) trên CTA chính; sheet + focus trap trên một số modal.
- Chỉ mount một cây danh sách (desktop **hoặc** mobile) — tránh dual-DOM ẩn CSS.

**Điểm yếu chính** — xem mục 4 (P0–P2).

---

## 3. Copy — viết tắt «ĐN»

**Quy tắc:** không dùng «ĐN»; luôn viết **«Đăng Nhập TCS»** trên UI và docs đụng tới.

| Trạng thái | Chi tiết |
|------------|----------|
| Nút chính | Đã đúng: `TcsPortalInlineBar` label/title «Đăng Nhập TCS», badge «Đã / Chờ / cần Đăng Nhập TCS» |
| Alert / hint / `setError` | Trước review còn nhiều «ĐN» trong toast/alert/help — **đã sửa** trong PR này |
| Docs | `docs/playwright-mcp-ops-qa.md`, `docs/railway-online-portal.md` — **đã sửa** |
| Comment / test name | Vẫn còn «ĐN» trong comment nội bộ (`TcsPortalInlineBar`, `useTcsPortalActions`, `tcsPortalScanGate*.ts`) — không hiện cho ops; nên dọn dần |

---

## 4. Findings ưu tiên

### P0 — Blocker / dễ gây lỗi vận hành

1. **Portal errors vẫn dựa `window.alert` / confirm native** — `TcsPortalInlineBar.tsx`, `InlineAwbEdit.tsx`, `ShipmentRowActionsMenu.tsx`, nhiều `utils/export*.ts`  
   - **Mô tả:** Luồng Đăng Nhập TCS / Quét / PW local / AWB conflict dùng `window.alert` — trên mobile/PWA dễ chặn UI, khó đọc, không đồng bộ Toast.  
   - **Tác động:** Ops bỏ lỡ hướng dẫn đăng nhập / quét; cảm giác app “treo”.  
   - **Đề xuất:** Chuyển sang `useToast` + `Banner`/`InlineError` đã có trong kit; giữ confirm xóa lô nhưng dùng modal có `role="alertdialog"`.

2. **Mobile ẩn nút Đăng Nhập TCS — phụ thuộc agent session** — `TcsPortalInlineBar.tsx` (`isMobile` → `showLoginBtn` false)  
   - **Mô tả:** Phone chỉ hiện Quét + «Đang khôi phục session»; không có CTA «Đăng Nhập TCS» khi agent fail.  
   - **Tác động:** Ops trên điện thoại kẹt khi session/OCR lỗi, không biết phải làm gì.  
   - **Đề xuất:** Khi `!loggedIn && agent offline/error`, hiện CTA rõ «Đăng Nhập TCS» hoặc deep-link hướng dẫn desktop Ext.

### P1 — Quan trọng

3. **Nhãn trạng thái không thống nhất 3 lớp** — `statusStyles.ts`  
   - Filter (`statusLabel`): «Hàng mới tiếp nhận», «Đã hoàn thành tiếp nhận»  
   - Select short: «Nhận hàng», «Hoàn thành tiếp nhận»  
   - Compact mobile: «Nhận», «HT»  
   - **Tác động:** Ops khó map chip lọc ↔ dropdown ↔ card.  
   - **Đề xuất:** Một glossary (filter = short; compact chỉ rút khi thiếu chỗ) và tooltip full phrase trên compact.

4. **Header mobile quá dày** — `OpsMobileStickyHeader.tsx`  
   - Brand + Live + 4 CTA icon, date, KPI, 4 nút copy ảnh (Vantage/Tecs/TCS/SCSC), warehouse 2×2, search, portal bar, status (toggle).  
   - **Tác động:** Danh sách lô bị đẩy xuống; scroll dài trước khi thấy AWB.  
   - **Đề xuất:** Gộp copy-report vào `OpsToolsMenu`; mặc định thu status (đã có ST) và portal tip.

5. **`ErrorState` gần như không dùng** — `ui/EmptyState.tsx` export `ErrorState`, chỉ re-export; Ops/Customers/Stats không gắn khi sync/API fail.  
   - Lỗi portal nằm trong state `tcs.error` / alert, không có pattern retry thống nhất trên board.  
   - **Đề xuất:** Banner lỗi sync + nút «Thử lại» gọi `refreshState`.

6. **Filter empty chỉ là đoạn text** — `AirCargoTracking.tsx` (~982)  
   - Khác `EmptyState` dashed khi ngày trống → hierarchy không đều.  
   - **Đề xuất:** Dùng `EmptyState` với `actionLabel="Xóa lọc"`.

7. **Luồng portal phức tạp trên UI** — Ext / agent cloud / PW local / Trực quan  
   - Help 9px dưới bar (`TcsPortalInlineBar`) dễ bỏ qua; acronym PW/HT/ESID chồng chéo.  
   - **Đề xuất:** Một dòng trạng thái executor + link «Giải thích» (drawer), tránh 4 nút mode cùng hàng trên compact.

### P2 — Polish

8. **`StatusSelect` compact `w-[4.75rem]` + `text-[10px]`** — `StatusBadge.tsx`  
   - Native `<select>` iOS vẫn phình; icon ký tự (○↓▣) yếu a11y so với text.  
   - Cân nhắc listbox custom hoặc chỉ text compact.

9. **Không có bottom tabs điều hướng Ops / Customers / Stats**  
   - Giả thuyết ban đầu sai một phần: nav nằm trong `OpsToolsMenu`.  
   - Ops mới trên phone khó tìm Danh bạ / Stats.  
   - Optional: 3 tab sticky đáy **hoặc** shortcut rõ trên sticky header.

10. **a11y cơ bản ổn nhưng chưa đều**  
    - ~126 `aria-*`, Toast `aria-live`, nhiều `role="dialog"` / `tablist`.  
    - `useModalFocusTrap` chỉ một số modal (DIM, CSD, AI) — sheet KH / Google Sheet / portal form Ext chưa chắc trap.  
    - `sr-only` rất ít (3); `alt=` gần như không (1).  
    - `SyncStatusPill` / status pills dựa màu + chữ ngắn — OK; bổ sung `aria-live` khi sync → offline.

11. **Typography density**  
    - Nhiều `text-[8px]`–`text-[9px]` trên chip/KPI mobile — dưới khuyến nghị đọc ~12px.  
    - Desktop table dense hợp kho; giữ, nhưng đừng giảm thêm.

12. **Customers mobile master–detail** — `CustomersPage.tsx`  
    - Pane list|detail tốt; dirty confirm dùng `window.confirm` — cùng pattern P0.

13. **Stats KPI cards** — `OpsStatsPage` dùng card (hợp dashboard); Ops lot list tránh card thừa — đúng hướng redesign.

---

## 5. Checklist nhanh theo tiêu chí review

| Tiêu chí | Đánh giá |
|----------|----------|
| Hierarchy | Ops: brand nhỏ + nhiều tool cùng hàng → portal/secondary lấn primary (AWB list) trên mobile |
| Density | Desktop dense table phù hợp ops; mobile header denser hơn danh sách |
| Spacing / type | Token ổn; một số label 8–9px quá nhỏ |
| Status pills | Màu + icon text; nhãn 3 lớp lệch (P1) |
| AWB readability | Tốt (mono, sticky, không truncate số) |
| Empty / loading / error | Empty + skeleton tốt; error path yếu (P1) |
| a11y basics | Focus ring rộng; focus trap / live region chưa phủ |
| Mobile usability | Card + sheet tốt; portal login & header height là điểm nghẽn |
| Confusing flows | Portal executor modes; SCSC bỏ HT vs TCS có HT |

---

## 6. Thay đổi code trong PR này (tối thiểu)

Chỉ sửa copy «ĐN» → «Đăng Nhập TCS» trên chuỗi người dùng thấy + docs liên quan:

- `src/components/TcsPortalInlineBar.tsx` — alert, title, hint online/Ext  
- `src/hooks/useTcsPortalActions.ts` — `setError` / workspace message  
- `docs/playwright-mcp-ops-qa.md`, `docs/railway-online-portal.md`  
- **Không** refactor UI, không đụng credentials / stack

---

## 7. Gợi ý bước tiếp (ngoài phạm vi PR)

1. Toast thay `window.alert` cho portal + AWB validation.  
2. CTA Đăng Nhập TCS khi mobile agent fail.  
3. Thống nhất glossary status.  
4. Thu gọn `OpsMobileStickyHeader` (copy-report → menu).  
5. Gắn `ErrorState` / retry trên sync fail.
