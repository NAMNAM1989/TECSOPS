# TECSOPS — Redesign Audit (Giai đoạn 0)

> Ngày audit: **2026-07-26**  
> Commit baseline: `7d50124` (`main`)  
> Spec: `[docs/TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md](./TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md)`  
> **Phạm vi:** chỉ khảo sát — **chưa sửa UI/nghiệp vụ**.

---

## 1. Tech stack và cách chạy


| Lớp             | Công nghệ                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| Frontend        | React 18.3, TypeScript ~5.6, Vite 5.4, Tailwind 3.4                       |
| Backend         | Express 4.21, `pg` (Postgres), Socket.IO, exceljs                         |
| Sidecar         | Chrome extension (`chrome-extension/`), TCS agent (`tcs-awb-automation/`) |
| Test            | Vitest, Playwright (QA smoke / extension)                                 |
| Deploy          | Railway / Docker; static `dist/` + API cùng process                       |
| Node            | `>=20` (máy audit: Node **v24.13.1**, npm **11.8.0**)                     |
| Package manager | **npm** (`package-lock.json`)                                             |


**Chạy local**

```bash
npm run dev:db          # Postgres Docker (port 5434)
# set DATABASE_URL theo .env.example
npm run dev             # Vite + API (scripts/dev.mjs)
npm run build && npm start
```

Không có `README.md` ở root; hướng dẫn env: `.env.example`.

---



## 2. Sơ đồ route / màn hình

Hash router tự viết — `src/hooks/useHashRoute.ts` — **không** React Router.

```
App.tsx
├── #/            → AirCargoTracking (Ops day board)     [lazy]
├── #/customers   → CustomersPage                        [lazy]
└── (overlay)     → PrintShippingLabel                   [lazy, state App]
```

- Không sidebar / app shell chung.
- Mỗi page tự sticky header.
- Breakpoint mobile UI: `useIsMobile(768)`.

---



## 3. Bản đồ component (dấu vết spec ↔ file thật)


| Dấu vết                              | Kết quả      | Path / ghi chú                                                                          |
| ------------------------------------ | ------------ | --------------------------------------------------------------------------------------- |
| `useHashRoute`                       | OK           | `src/hooks/useHashRoute.ts`                                                             |
| `App.tsx`                            | OK           | `src/App.tsx`                                                                           |
| `AirCargoTracking`                   | OK           | `src/components/AirCargoTracking.tsx`                                                   |
| `OpsMobileStickyHeader`              | OK           | `src/components/OpsMobileStickyHeader.tsx`                                              |
| `StatInline`                         | OK (local)   | định nghĩa trong `AirCargoTracking.tsx` — không file riêng                              |
| `OpsDatePicker`                      | OK           | `src/components/OpsDatePicker.tsx`                                                      |
| `SmartSearchBar`                     | OK           | `src/components/SmartSearchBar.tsx`                                                     |
| `WarehouseGridPicker`                | OK           | `src/components/WarehouseGridPicker.tsx`                                                |
| `NewBookingButton`                   | OK           | `src/components/NewBookingButton.tsx`                                                   |
| `DesktopShipmentTable`               | OK           | `src/components/DesktopShipmentTable.tsx`                                               |
| `MobileShipmentCards`                | OK           | `src/components/MobileShipmentCards.tsx`                                                |
| `MobileShipmentEditSheet`            | OK           | `src/components/MobileShipmentEditSheet.tsx`                                            |
| `StickyMobileActions`                | OK           | export từ `MobileShipmentCards.tsx`                                                     |
| `HoverMagnifyText`                   | OK           | `src/components/HoverMagnifyText.tsx` ← dùng ở `InlineCneeCell.tsx`                     |
| `SelectableTextWithCopyPopover`      | OK           | `src/components/SelectableTextWithCopyPopover.tsx`                                      |
| `ShipmentRowActionsMenu`             | OK           | `src/components/ShipmentRowActionsMenu.tsx`                                             |
| `CustomerPicker` / Suggest           | OK           | `CustomerPickerField.tsx`, `CustomerSuggestDropdown.tsx`                                |
| `StatusFilterBar`                    | OK           | `src/components/StatusFilterBar.tsx`                                                    |
| `StatusBadge`                        | **Tên lệch** | file `StatusBadge.tsx` **chỉ export** `StatusSelect` — không có component `StatusBadge` |
| `StatusSelect`                       | OK           | cùng `StatusBadge.tsx`                                                                  |
| `MobileDimKgModal`                   | OK           | `src/components/MobileDimKgModal.tsx`                                                   |
| `GoogleSheetImportModal`             | OK           | `src/components/GoogleSheetImportModal.tsx`                                             |
| `PrintShippingLabel`                 | OK           | `src/components/PrintShippingLabel.tsx`                                                 |
| `AirlineLabelSettingsModal`          | OK           | `src/components/AirlineLabelSettingsModal.tsx`                                          |
| `TcsPortalInlineBar`                 | OK           | `src/components/TcsPortalInlineBar.tsx`                                                 |
| `CustomerEsidQuickFillModal`         | OK           | `src/components/customerDirectory/CustomerEsidQuickFillModal.tsx` (còn untracked local) |
| `CustomersPage`                      | OK           | `src/pages/CustomersPage.tsx`                                                           |
| `CustomerSavedProfilesEditor`        | OK           | `…/CustomerSavedProfilesEditor.tsx` — **chỉ import từ CustomersPage**                   |
| `CustomerDeleteConfirmModal`         | OK           | `…/CustomerDeleteConfirmModal.tsx`                                                      |
| `opsModalStyles` / `mobileOpsStyles` | OK           | `src/styles/opsModalStyles.ts` (`OPS`), `mobileOpsStyles.ts` (`MOBILE`)                 |


---



## 4. Luồng nghiệp vụ chính



### 4.1 Booking / cập nhật lô

- Tạo lô: `NewBookingButton` → `blankShipmentDraft` → `useShipmentSync.mutate`.
- Sửa: inline edit desktop / card + bottom sheet mobile.
- Ngày phiên: `sessionDate` (YYYY-MM-DD local) — **không** phải user session.



### 4.2 Sync / realtime / offline

`src/hooks/useShipmentSync.ts`:


| Kênh                 | Vai trò                                     |
| -------------------- | ------------------------------------------- |
| `GET /api/state`     | hydrate                                     |
| `POST /api/mutation` | mọi mutation; response = state mới          |
| Socket.IO `sync`     | realtime đa máy                             |
| localStorage         | fallback offline (rows/customers/overrides) |
| Badge UI             | Live / Đồng bộ hạn chế / Chỉ máy này        |


**Auth:** không có login/JWT/password cho API state/mutation. `credentials: "include"` chỉ phòng cookie nếu có — app không set session người dùng.

### 4.3 Kho

`src/constants/warehouses.ts`: `TECS-TCS`, `TECS-SCSC` (+ normalize legacy `KHO-*`).

### 4.4 Workflow trạng thái (hiện tại)

Nguồn sự thật: `shared/shipmentWorkflowStatus.mjs` — **một bộ 9 status cho mọi kho**, không phân nhánh TCS/SCSC.


| Code                  | Label UI (`statusStyles.ts`) | Auto / manual |
| --------------------- | ---------------------------- | ------------- |
| `PENDING`             | BOOKING                      | auto          |
| `RECEIVED`            | ĐÃ NHẬN HÀNG                 | auto          |
| `VOLUME_DONE`         | ĐÃ ĐO VOLUME                 | auto          |
| `CUSTOMS`             | HẢI QUAN                     | manual        |
| `SECURITY`            | AN NINH                      | manual        |
| `OLA_PULL`            | KÉO OLA                      | manual        |
| `RECEPTION_COMPLETED` | HOÀN THÀNH TIẾP NHẬN         | manual        |
| `WEIGH_SLIP`          | NỘP TỜ CÂN                   | manual        |
| `COMPLETED`           | HOÀN THÀNH                   | manual        |


Auto derive từ AWB 11 số + pcs + DIM. Có legacy map (`AT_RISK`, `BUILT_UP`, …).

**≠ Spec §5.6** (workflow riêng theo kho). Cần kế hoạch mapping + tương thích lịch sử trước khi đổi.

### 4.5 KPI Lô / Kiện / Kg

```ts
// AirCargoTracking — filteredViewRows
lots = length
pcs  = sum(r.pcs ?? 0)
kg   = sum(r.kg ?? 0)  // formatKgTotal — max 3 decimals, không rút "36.9k"
```

Warehouse chips: `computeWarehouseMetrics` cùng công thức theo từng kho.

### 4.6 DIM

- UI: `MobileDimKgModal` (desktop + mobile).
- Paste Excel, template lưu/tải, custom presets, bulk fill — đang active.
- **Speech:** `parseSpeechToDimLines` + test + CSS `dim-voice-bar` **tồn tại nhưng không gắn UI mic** trong modal → gỡ theo spec là gỡ dead code / animation, không phải gỡ nút mic đang live.
- Export LIST DIM SCSC / ATTACHED DIM TCS tách theo kho.



### 4.7 Google Sheet import

- Modal: `GoogleSheetImportModal` — sync theo `sessionYmd`.
- **Không có ô URL trên UI.** Spreadsheet ID từ server env `GOOGLE_SHEETS_BOOK_SPREADSHEET_ID` hoặc hardcode fallback trong `server/sheets/googleSheetFetch.mjs`.
- Client không gửi `spreadsheetId` khi sync.
- Thành công/lỗi: nhiều chỗ dùng `window.alert`.



### 4.8 Xuất Excel ngày

- `downloadDayReportExcel` — 1 ngày phiên hiện tại.
- **Chưa** có range filter ngày trên UI (chỉ prev/next/today + date picker 1 ngày).



### 4.9 In tem


| File                                   | Vai trò                    |
| -------------------------------------- | -------------------------- |
| `src/styles/print-label.css`           | layout grid mm             |
| `src/utils/printThermalLabelIframe.ts` | `@page` động, iframe print |
| `shared/thermalLabelPresets.mjs`       | `100x80`, `100x50`         |
| `src/printing/*`                       | format + printer profiles  |
| `PrintShippingLabel.tsx`               | preview UI                 |


**Ràng buộc redesign:** chỉ đụng overlay/preview/settings — không đổi mm/`@page`/nội dung tem.

### 4.10 TCS / ESID / extension

- `TcsPortalInlineBar` + `useTcsPortalActions`.
- ESID: nhiều nút settings (profile / agent / registrant) + `CustomerEsidQuickFillModal`.
- Chrome extension bridge: `utils/tcsChromeExtension.ts`.
- Không auth app; login TCS nằm ngoài (CAPTCHA / agent).



### 4.11 Khách hàng

- `CustomersPage`: list + detail, dirty Hủy/Lưu, validation.
- `CustomerSavedProfilesEditor`: UI tab shipper/CNEE/goods/xe.
- **Dữ liệu** `savedShippers` / `savedConsignees` / `savedGoods` / `savedVehicles` được dùng rộng:
  - `MobileShipmentEditSheet`, `DesktopShipmentTable` (CNEE options)
  - `customerBookingResolve`, ESID declare / quick fill
  - Excel import/export khách
- **Print tem cargo** không import editor; map từ field shipment + airline overrides.
- **Kết luận gỡ editor:** được phép theo spec **chỉ sau** khi chuyển UX sang “Dữ liệu mặc định” — **không được xóa model/array saved** nếu chưa có UI thay thế.

---



## 5. Design system hiện tại


| Mục        | Hiện trạng                                                                        | Hướng spec                      |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------- |
| Token      | `dashboard` / `apple` / `ops` rải Tailwind                                        | Semantic token                  |
| Font UI    | Plus Jakarta Sans (Google Fonts)                                                  | Giữ                             |
| Font data  | `.font-shipment-data` → Roboto Mono (**chưa load** trong `index.html`)            | IBM Plex Mono                   |
| Accent     | `#0D9488` / `#0F766E`                                                             | Giữ                             |
| Canvas     | `#E8EEF4`                                                                         | Giữ                             |
| Dark       | `darkMode: "class"` + nhiều `dark:` — **không có toggle**                         | Light chính; gỡ dark lộ UI      |
| Glass/blur | sticky header `backdrop-blur-xl`; `MOBILE.sheet` dùng `.glass-panel`; modals blur | Header phẳng, không blur        |
| Components | Không UI kit; class string `OPS`/`MOBILE`                                         | Button/Input/Modal/Sheet/Toast… |
| Alert      | `window.alert` (~25+ call sites FE)                                               | Toast System                    |


---



## 6. Code trùng lặp & rủi ro hồi quy



### Trùng / nợ kỹ thuật

1. Class modal/sheet/input lặp giữa `OPS` và `MOBILE`.
2. Không có `Button`/`Toast`/`Sheet` chung — copy Tailwind dài.
3. `StatusBadge.tsx` đặt tên sai (chỉ `StatusSelect`).
4. `StatInline` / sync badge desktop vs mobile tách đôi.
5. Warehouse picker desktop ≠ chips mobile (hai pattern).
6. Speech parser + CSS animation chết (không UI).
7. Favicon vẫn `public/vite.svg`.



### Risk register (cao → thấp)


| ID  | Rủi ro                                                      | Ảnh hưởng          | Mitigation                                                        |
| --- | ----------------------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| R1  | Đổi workflow theo kho làm hỏng lịch sử `CUSTOMS`/`SECURITY` | Data + UI filter   | Mapping tương thích; test fixture lịch sử; không hard-delete enum |
| R2  | Gỡ `CustomerSavedProfilesEditor` làm mất chỗ sửa saved      | Booking/ESID/Excel | Redesign “Dữ liệu mặc định” trước; giữ schema                     |
| R3  | Đụng `print-label.css` / `@page` khi skin preview           | Tem sai khổ        | PR riêng print; snapshot mm                                       |
| R4  | Gỡ `dark:` ồ ạt                                             | Diff lớn, dễ sót   | Script/codemod từng đợt; visual light-only                        |
| R5  | Thêm URL Sheet trên UI vs env hardcode                      | Sai sheet prod     | Validate + quyền; giữ default env                                 |
| R6  | Gom overflow menu che CTA booking                           | Ops chậm           | CTA booking luôn primary ngoài menu                               |
| R7  | Range date Excel khi API chỉ có session 1 ngày              | Feature lệch       | Xác nhận trước: filter client-side vs API mới                     |
| R8  | IBM Plex Mono thay Roboto Mono                              | FOIT/layout shift  | preconnect + fallback mono stack                                  |


---



## 7. Baseline test / build (2026-07-26)


| Lệnh                  | Kết quả                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`   | **PASS**                                                                                                                                                       |
| `npm run lint`        | **PASS** với **5 warnings** sẵn có (không error): `MobileDimKgModal` any; `useShipmentSync` any; `customerFullProfileExcel` any×2 + unused `totalVehicleCount` |
| `npm run lint:server` | **PASS**                                                                                                                                                       |
| `npm test` (vitest)   | **PASS** — 53 files / **303** tests                                                                                                                            |
| `npm run build`       | **PASS** — cảnh báo chunk `vendor-excel` >500kB; dynamic/static import `downloadXlsx`                                                                          |
| `npm run qa:smoke`    | **Chưa chạy trong audit** (cần quy trình riêng + máy có data; script: `scripts/qa-smoke-e2e.mjs`)                                                              |


**Lỗi/cảnh báo có sẵn** — không quy cho đợt nâng cấp sau nếu không đụng các file trên.

### Baseline visual

Chụp từ `http://127.0.0.1:5173` (dev đang chạy):

`docs/audit-baselines/`


| File                                 | Breakpoint |
| ------------------------------------ | ---------- |
| `ops-375.png`, `customers-375.png`   | 375×812    |
| `ops-768.png`, `customers-768.png`   | 768×1024   |
| `ops-1280.png`, `customers-1280.png` | 1280×720   |
| `ops-1440.png`, `customers-1440.png` | 1440×900   |


---



## 8. Ma trận quyết định (đối chiếu code thật)


| Quyết định spec                                                   | Hiện trạng code                            | Ghi chú triển khai                                                    |
| ----------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| **Gỡ** Hover/CNEE magnify                                         | `HoverMagnifyText` sống ở `InlineCneeCell` | Gỡ component + CSS magnify + test position                            |
| **Gỡ** speech/mic/voice animation                                 | Parser + CSS có; **UI mic không có**       | Xóa dead code/CSS/test speech hoặc giữ parser nội bộ nếu còn dùng tay |
| **Gỡ** `CustomerSavedProfilesEditor`                              | UI only; data saved dùng nhiều nơi         | Phải có UI thay thế trước                                             |
| **Redesign** header phẳng                                         | Sticky + `backdrop-blur-xl` / glass        | Đợt B                                                                 |
| **Redesign** workflow theo kho                                    | Hiện 1 pipeline 9 status                   | Đợt D — cần duyệt mapping                                             |
| **Thêm** URL Sheet trên UI                                        | Chưa có                                    | Đợt F                                                                 |
| **Thêm** Excel range ngày                                         | Chỉ 1 ngày                                 | Đợt F — xác nhận R7                                                   |
| **Không tự thêm** auth / router mới / dark toggle / đổi layout in | Khớp audit                                 | Tuân thủ                                                              |


---



## 9. Câu hỏi cần xác nhận (không đoán)

1. **Workflow theo kho (spec §5.6):** Với lô lịch sử đang ở `CUSTOMS` / `SECURITY` / `RECEPTION_COMPLETED` trên SCSC (nơi spec không còn các bước này) — giữ hiển thị read-only, map sang bước gần nhất, hay ẩn khỏi filter? - ẩn 
2. Label chuẩn: giữ “KÉO OLA” hay đổi chữ **OLA** theo quy tắc viết hoa nghiệp vụ? - đổi chữ **OLA** theo quy tắc viết hoa nghiệp vụ
3. Spreadsheet Book: luôn lấy từ env, hay bắt buộc ô URL mỗi lần import? Default hardcode có còn đúng sheet production? - bắt buộc ô URL mỗi lần import
4. Máy in kho đang dùng profile nào (`xp470b` vs 80mm) và khổ `100×80` hay `100×50` là mặc định? cả 2 khổ giấy 
5. `CustomerSavedProfilesEditor`: xác nhận ops còn sửa shipper/CNEE/goods/xe trong tab này hàng ngày không? Nếu có, UI thay thế (“Dữ liệu mặc định”) phải ship cùng PR gỡ.- có sửa khi cần. 
6. Excel theo **khoảng ngày**: lọc trên client từ toàn bộ rows đã sync, hay cần API mới? - lọc trên client từ toàn bộ rows đã sync
7. TCS portal / Chrome extension còn bắt buộc trên Railway production không? - không
8. Có chấp nhận gỡ hết class `dark:` trong đợt A–D, hay chỉ ẩn bằng light-only CSS? - gỡ hết

*(Các mục khác đã trả lời được từ code — xem §4–§5.)*

---



## 10. Kế hoạch triển khai (PR/commit nhỏ theo Đợt A–F)

Tuân thủ spec §7. Mỗi đợt: 1–n PR nhỏ, có test/build, báo cáo theo §10 spec.

### Đợt A — Nền tảng UI

- Semantic tokens (`background`/`surface`/`primary`/…) map từ teal/canvas hiện tại.
- Nạp **IBM Plex Mono**; tabular-nums cho số.
- Skeleton thay “Đang tải…”.
- Toast/Banner thay dần `window.alert` (bắt đầu điểm Ops/Sheet).
- Logo SVG + favicon; bỏ `vite.svg`.
- Light mode: ngừng lộ dark (chiến lược theo câu hỏi #8).
- **Không** đổi nghiệp vụ.



### Đợt B — OPS shell & header

- App bar mỏng chung (Ops | Khách), sticky **phẳng không blur**.
- Gom Sheet/Excel/Tên hãng/Khách vào `⋯` — giữ CTA booking ngoài.
- KPI / date / search / kho / Live badge / empty-loading-error.
- Thống nhất pattern chọn kho desktop+mobile.



### Đợt C — Dữ liệu lô

- Desktop table hierarchy + mono AWB + focus/save states.
- Mobile cards (AWB lớn…) + edit sheet tabs + sticky actions.
- Giữ inline edit + copy popover; row actions menu.
- Customer picker keyboard.



### Đợt D — Workflow & gỡ noise

- Mapping workflow TCS/SCSC + test dữ liệu lịch sử (**chờ trả lời §9.1**).
- Status filter/chip dễ đọc (text+icon).
- Gỡ magnify; gỡ speech dead code / voice CSS; gỡ blur còn sót.



### Đợt E — Khách hàng & công cụ

- Master–detail + dirty sticky mobile.
- Tab Thông tin / Liên hệ / Dữ liệu mặc định.
- Gom import/export Excel; danger zone xóa.
- Thay `CustomerSavedProfilesEditor` an toàn.



### Đợt F — DIM, TCS, import/export, print preview

- DIM UI (giữ paste + template chính).
- Sheet URL + kết quả import chi tiết.
- Excel theo ngày/range (sau xác nhận).
- TCS bar gọn + ESID settings gom.
- Print **preview/settings only** + regression kích thước.

---



## 11. Dependency map (rút gọn)

```
App
├── useShipmentSync ──► /api/state · /api/mutation · socket sync · localStorage
├── AirCargoTracking
│   ├── Ops header / mobile sticky
│   ├── DesktopShipmentTable ──► Inline* · StatusSelect · RowActions · CustomerPicker
│   ├── MobileShipmentCards · EditSheet · DimKgModal
│   ├── GoogleSheetImportModal ──► /api/sheets/book/*
│   ├── TcsPortalInlineBar ──► tcs agent / extension
│   └── onRequestPrint ──► PrintShippingLabel ──► print-label.css / thermal iframe
└── CustomersPage
    ├── CustomerSavedProfilesEditor ──► savedShippers/Consignees/Goods/Vehicles
    ├── CustomerEsidQuickFillModal
    └── Excel import/export utils
```

Print tem **không** phụ thuộc editor; phụ thuộc field đã patch lên `Shipment`.

---



## 12. Kết luận Giai đoạn 0

- Audit phản ánh đúng repo hiện tại; hầu hết dấu vết component tồn tại (một số tên lệch / local helper).
- Baseline typecheck / lint / unit / build **xanh** (lint có 5 warning sẵn).
- Visual baseline đã chụp 4 breakpoint × 2 màn → `docs/audit-baselines/`.
- Ba điểm **blocker cần duyệt trước khi code Đợt A/D/E**:
  1. Mapping workflow theo kho với dữ liệu lịch sử.
  2. Chiến lược gỡ dark / light-only.
  3. Lộ trình thay `CustomerSavedProfilesEditor` (data model giữ).

**Dừng tại đây theo spec.** Chờ duyệt audit + trả lời §9 trước khi bắt đầu **Đợt A**.

---

## 13. Đợt A — đã triển khai (2026-07-26)

Quyết định khi bắt đầu Đợt A (theo spec §4.1):

- **Light mode** chính thức; không gắn `.dark` trên `html`.
- Class `dark:` còn lại trong codebase (tránh diff khổng lồ) nhưng **không kích hoạt**.
- `.glass-panel` → nền phẳng trắng; sticky header blur còn lại xử lý ở Đợt B.

| Hạng mục | File / ghi chú |
|---|---|
| Semantic token `ui.*` | `tailwind.config.js` — giữ legacy `dashboard`/`apple`/`ops` |
| IBM Plex Mono + tabular | `index.html`, `index.css` `.font-shipment-data` |
| UI kit nền | `src/ui/*` — Button, IconButton, Skeleton, Banner, Toast, Wordmark, Empty/Error |
| Logo/favicon | `public/favicon.svg`, `apple-touch-icon.svg`, `brand-tecsops.svg`; đã xóa `vite.svg` |
| Skeleton Suspense | `App.tsx` |
| Toast thay alert Ops/Sheet | `AirCargoTracking` (mutate / Excel / Sheet success) |

Còn lại đợt sau: wire Button toàn app; gỡ hết `dark:`; header phẳng (B); workflow (D).

---

## 14. Đợt B — đã triển khai (2026-07-26)

| Hạng mục | Ghi chú |
|---|---|
| `AppShell` sticky phẳng | Không blur/glass |
| `OpsToolsMenu` (⋯ Công cụ) | Khách / Tên hãng / Sheet / Excel / DIM SCSC — CTA Booking ngoài menu |
| `SyncStatusPill` | Live / hạn chế / offline — ẩn chi tiết kỹ thuật |
| KPI `KpiStat` | Desktop + mobile cùng pattern; kg qua `formatKgTotal` |
| Chọn kho thống nhất | Mobile dùng `WarehouseGridPicker` compact (thay chips riêng) |
| Empty / offline | EmptyState ngày trống; Banner offline |
| Customers header | Phẳng, bỏ backdrop-blur |

---

## 15. Đợt C — đã triển khai (2026-07-26)

| Hạng mục | Ghi chú |
|---|---|
| Desktop table | Font ≥13px, mono AWB/DST/số, sticky header + cột AWB, surface phẳng |
| Inline edit | Focus ring `ui-focus`; AWB danger color semantic |
| Mobile cards | AWB lớn, khách, kho chip, kiện/kg rõ, chạm mở sheet |
| Edit sheet | Sheet phẳng, tabs Booking/Thông báo/DIM, nút ≥44px |
| Sticky actions | Bar đặc, CTA Sửa / + Booking |
| Row actions | Icon 32px, toolbar token mới |
| Customer picker | Default input focus ring khi không truyền class |

---

## 16. Đợt D — đã triển khai (2026-07-26)

Quyết định mapping (§9.1): **ẩn** `CUSTOMS` / `SECURITY` / `COMPLETED` khỏi filter; SCSC không hiện `RECEPTION_COMPLETED`. Enum DB giữ nguyên; lô lịch sử vẫn hiển thị trong select nếu đang mang mã ngoài luồng.

| Hạng mục | Ghi chú |
|---|---|
| Workflow theo kho | `WORKFLOW_BY_WAREHOUSE` trong `shared/shipmentWorkflowStatus.mjs` |
| StatusSelect | Option theo `warehouse` của lô |
| StatusFilterBar | Chip theo `activeWarehouse`; icon + text; phẳng không blur |
| Label | Spec §5.6; `OLA_PULL` → **Kéo OLA** |
| Gỡ magnify | Xóa `HoverMagnifyText` + position util; thay `CneeDetailPopover` + copy popover |
| Gỡ speech | Xóa `parseSpeechToDimLines` / CSS voice + magnify animation |
| Gỡ dark:/blur | Strip `dark:` utilities; overlay/footer dùng nền đặc |

---

## 17. Đợt E — đã triển khai (2026-07-26)

| Hạng mục | Ghi chú |
|---|---|
| Master–detail | Desktop list trái + detail phải; mobile list → detail + « ← Danh sách » |
| Tabs hồ sơ | Thông tin · Liên hệ · Dữ liệu mặc định |
| Dirty / save | Confirm khi đổi khách; sticky Lưu/Hủy mobile; toast + banner lỗi |
| Công cụ | `OverflowMenu` — mẫu / import / export Excel |
| Danger zone | Xóa khách trong tab Thông tin + `CustomerDeleteConfirmModal` |
| Dữ liệu mặc định | `CustomerDefaultDataEditor` (alias cũ `CustomerSavedProfilesEditor`); **giữ schema saved*** |
| ESID trên trang KH | Giữ nút « Điền eSID TCS »; gom settings agent/registrant → Đợt F |

---

## 18. Đợt F — đã triển khai (2026-07-26)

| Hạng mục | Ghi chú |
|---|---|
| Sheet URL | Ô URL bắt buộc; `spreadsheetId` gửi sync; không auto-prefetch |
| Sheet kết quả | Banner + «Xem lỗi»; toast success / partial |
| Excel range | `DayExcelExportDialog` + `filterShipmentsBySessionYmdRange` (client) |
| Filename Excel | `OPS_shipments_{from}_{to}_{time}.xlsx` khi khoảng |
| TCS bar | Gọn: trạng thái + Đồng bộ + Cài đặt ESID + Nâng cao |
| ESID settings | `EsidSettingsMenu` gom Người khai + Agent |
| DIM labels | LIST DIM SCSC / ATTACHED DIM / In LIST DIM… |
| Print overlay | Shell phẳng; không đổi mm / `@page` / iframe |