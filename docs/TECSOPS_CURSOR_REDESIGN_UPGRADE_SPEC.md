# TECSOPS — Yêu cầu Cursor nghiên cứu, thiết kế lại và nâng cấp dự án hiện hữu

> Tài liệu giao việc cho Cursor Agent.  
> Nguồn yêu cầu: `TECSOPS_bang_ghi_nhan_sua_doi_UI(1).xlsx` — 50 hạng mục thuộc 9 nhóm.

## 1. Vai trò và mục tiêu

Bạn là **Senior Product Engineer + UI/UX Architect** phụ trách nghiên cứu và nâng cấp dự án TECSOPS đang có sẵn trên máy.

Mục tiêu:

- Nghiên cứu đầy đủ code hiện hữu trước khi đề xuất hoặc sửa.
- Thiết kế lại UI theo phong cách **Operational Signal**: hiện đại, chính xác, dễ quét, tối ưu thao tác vận hành hàng hóa thời gian thực.
- Giữ nguyên nghiệp vụ, dữ liệu, tích hợp, công thức, in tem và các chức năng đang hoạt động, trừ các hạng mục được yêu cầu gỡ rõ ràng.
- Chuẩn hóa kiến trúc UI và giảm code trùng lặp.
- Bảo đảm desktop và mobile đều dùng tốt; ưu tiên môi trường kho và thao tác nhanh.
- Thực hiện nâng cấp theo từng đợt nhỏ, có thể kiểm thử và quay lại an toàn.

Không được bắt đầu bằng việc viết lại toàn bộ dự án.

## 2. Nguyên tắc bắt buộc

1. **Code hiện hữu là nguồn sự thật.** Tên component và file trong tài liệu này chỉ là dấu vết tìm kiếm ban đầu; phải xác minh trong repository.
2. Không làm mất dữ liệu, thay schema, migration, API contract, auth, route, local storage, cơ chế đồng bộ hoặc tích hợp bên ngoài nếu chưa chứng minh cần thiết.
3. Không xóa token/class/component cũ trước khi đã thay toàn bộ nơi sử dụng và kiểm thử hồi quy.
4. Không làm đẹp bằng cách thay đổi nghiệp vụ.
5. Với chức năng in tem, chỉ thiết kế lại giao diện preview/cài đặt; **không tự ý đổi kích thước thật, CSS `@page`, đơn vị mm, margin, tỷ lệ hoặc nội dung tem**.
6. Không dùng mock data trong luồng production và không che lỗi bằng fallback giả.
7. Không thêm dependency lớn nếu chức năng tương đương đã có.
8. Không để lại TypeScript error, lint error, test fail, console error hoặc dead code do lần nâng cấp tạo ra.
9. Mọi hành động nguy hiểm phải có xác nhận; không đặt “Xóa” cạnh CTA chính.
10. Nếu yêu cầu mâu thuẫn với code hoặc nghiệp vụ thực tế, dừng hạng mục đó, ghi bằng chứng và đề xuất phương án; không tự đoán.

## 3. Giai đoạn 0 — Khảo sát bắt buộc, chưa sửa code

Trước khi triển khai, hãy đọc:

- `README`, `package.json`, lockfile, cấu hình build/deploy.
- `AGENTS.md`, `.cursor/rules`, tài liệu kiến trúc và convention nếu có.
- Cấu trúc `src`, router, page, layout, component, hook, store/state, service/API.
- Tailwind/CSS/theme/token, font, icon và asset.
- Test unit/integration/E2E, CI/CD và script kiểm tra.
- Cơ chế dữ liệu, sync/realtime/offline, import/export, in tem.
- Code TCS, ESID, Chrome extension bridge và Google Sheet.

Tìm và lập bản đồ các dấu vết sau nếu tồn tại:

`useHashRoute`, `App.tsx`, `AirCargoTracking`, `OpsMobileStickyHeader`, `StatInline`, `OpsDatePicker`, `SmartSearchBar`, `WarehouseGridPicker`, `NewBookingButton`, `DesktopShipmentTable`, `MobileShipmentCards`, `MobileShipmentEditSheet`, `StickyMobileActions`, `HoverMagnifyText`, `SelectableTextWithCopyPopover`, `ShipmentRowActionsMenu`, `CustomerPicker`, `SuggestDropdown`, `StatusFilterBar`, `StatusBadge`, `StatusSelect`, `MobileDimKgModal`, `GoogleSheetImportModal`, `PrintShippingLabel`, `AirlineLabelSettingsModal`, `EsidSettingsMenu`, `CustomersPage`, `CustomerSavedProfilesEditor`, `CustomerDeleteConfirmModal`, `opsModalStyles`, `mobileOpsStyles`.

Chạy baseline bằng đúng package manager của dự án:

- Cài dependency chỉ khi cần và theo lockfile.
- Chạy typecheck, lint, unit/integration test, E2E phù hợp và production build.
- Chụp/ghi lại UI hiện tại tại các breakpoint tối thiểu: `375`, `768`, `1280`, `1440`.
- Ghi nhận lỗi có sẵn, không quy lỗi cũ cho phần nâng cấp.

### Đầu ra bắt buộc trước khi code

Tạo `docs/TECSOPS-REDESIGN-AUDIT.md`, gồm:

- Tech stack và cách chạy dự án.
- Sơ đồ route/màn hình.
- Bản đồ component → file → dữ liệu/API → nơi sử dụng.
- Luồng nghiệp vụ chính: booking, cập nhật lô, workflow theo kho, DIM, import/export, in tem, TCS/ESID.
- Danh sách code trùng lặp và rủi ro hồi quy.
- Baseline test/build.
- Những điểm chưa rõ cần xác nhận.
- Kế hoạch triển khai chia PR/commit nhỏ.

Chỉ chuyển sang triển khai khi bản audit đã hoàn tất.

## 4. Hướng thiết kế thống nhất

### 4.1. Phong cách

- Phong cách: **Operational Signal**.
- Giao diện phẳng, ít hiệu ứng, ưu tiên tốc độ và độ rõ.
- Light mode là chế độ chính thức trong đợt này.
- Gỡ cách dùng class dark đang lộ ra UI nếu chưa có toggle hoàn chỉnh; vẫn dùng semantic token để có thể bổ sung dark mode sau.
- Không dùng glassmorphism/blur cho header. Dùng nền trắng gần đặc, border dưới nhẹ và shadow tối thiểu.

> Quyết định này xử lý mâu thuẫn trong bảng nguồn: hạng mục “sticky glass header” được hiểu là **sticky header mật độ cao**, nhưng visual phải tuân theo yêu cầu mới hơn là **header phẳng, không blur**.

### 4.2. Brand token

Giữ:

- Accent teal: `#0D9488`.
- Teal đậm cho nút có chữ trắng: `#0F766E`.
- Canvas: `#E8EEF4`.
- Navy cho phần `TECS` của wordmark.

Xây semantic token thay vì rải mã màu trực tiếp:

- `background`, `surface`, `surface-muted`.
- `text`, `text-muted`, `border`.
- `primary`, `primary-hover`, `focus-ring`.
- `success`, `warning`, `danger`, `info`.
- Màu trạng thái workflow có tương phản tốt và không phụ thuộc chỉ vào màu.

### 4.3. Typography

- Plus Jakarta Sans: tiêu đề, nội dung, label, button.
- IBM Plex Mono: AWB/HAWB, chuyến bay, mã sân bay, ngày giờ và số liệu cần quét nhanh.
- Bật `font-variant-numeric: tabular-nums` cho dữ liệu số.
- Căn phải dữ liệu số.
- Font bảng tối thiểu 13px.
- Phải phân biệt rõ `0/O`, `1/I`.

### 4.4. Component dùng chung

Chuẩn hóa tối thiểu:

- `Button`, `IconButton`.
- `Input`, `NumberInput`, `SearchInput`, `Select/Combobox`.
- `Badge`, `StatusChip`.
- `Toast`, `Banner`, `InlineError`.
- `Modal/Dialog`, `ConfirmDialog`, `Sheet/BottomSheet`.
- `DropdownMenu`, `OverflowMenu`.
- `Skeleton`, `EmptyState`, `ErrorState`.
- `DataTable`, `MobileCard`.
- `StickyActionBar`.

Yêu cầu:

- Focus visible rõ.
- Vùng chạm mobile tối thiểu 44×44px.
- Keyboard navigation hợp lý.
- Label và thông báo lỗi có liên kết truy cập.
- Không tạo thêm component trùng chức năng chỉ vì khác màn hình.

## 5. Phạm vi nâng cấp chi tiết

### 5.1. Shell, route và xác thực

- Giữ hash route hiện tại nếu dự án thực tế chỉ có hai màn và chưa có lý do kỹ thuật để đổi router.
- Giữ lazy load + Suspense; thay màn “Đang tải…” bằng skeleton phù hợp.
- Tạo app shell chung tối giản:
  - App bar mỏng, sticky.
  - Logo/menu, tên phân hệ, trạng thái hệ thống và tài khoản nếu đã có auth.
  - Không dùng sidebar cố định.
- Desktop cho phép bố cục dữ liệu rộng.
- Mobile dùng luồng “Danh sách → Chi tiết”, có nút quay lại và sticky action khi chỉnh sửa.
- Màn đăng nhập/auth:
  - Trước hết xác minh backend/auth và môi trường triển khai.
  - Nếu auth đã tồn tại nhưng UI thiếu, thiết kế lại UI.
  - Nếu chưa có auth, chỉ lập đề xuất bảo mật riêng; không tự thêm auth làm thay đổi phạm vi.

### 5.2. Logo, favicon và nhận diện

- Tạo wordmark SVG: `TECS` navy + `OPS` teal.
- Tạo biểu tượng riêng từ chữ `O/OPS` hoặc kiện hàng + đường chuyển động.
- Xuất SVG và favicon/app icon phù hợp các cỡ `16`, `32`, `180`, `512`.
- Xóa hoàn toàn favicon Vite sau khi asset mới được nối đúng vào app/PWA manifest.

### 5.3. Màn OPS — khung tổng

Đây là màn P0, không được gỡ.

- Header desktop sticky, phẳng, không blur.
- Header mobile mật độ cao nhưng dễ chạm.
- Gom các action thứ cấp như Khách/Tên hãng/Sheet/Excel vào menu `⋯` hoặc menu “Công cụ”.
- Không gom CTA chính “Tạo booking” vào overflow menu.
- KPI Lô/Kiện/Kg:
  - Giữ nguồn dữ liệu và độ chính xác hiện tại.
  - Format kg đúng, không tự làm tròn gây sai vận hành.
- Date picker:
  - Trước, sau, hôm nay.
  - Bổ sung lọc theo ngày/khoảng ngày nếu dữ liệu/API hỗ trợ.
- Smart Search:
  - Tìm AWB/lô.
  - Có thể chuyển đúng kho và highlight kết quả.
- Hai kho `TECS-TCS` và `TECS-SCSC` dùng cùng một pattern chọn kho trên desktop/mobile.
- Hiển thị trạng thái kết nối: Live / hạn chế / offline; ẩn chi tiết kỹ thuật khỏi giao diện thường.
- CTA “Tạo booking” nổi bật, dễ tìm và không bị trùng.
- Có đầy đủ empty/loading/error/offline state.

### 5.4. Bảng lô desktop

- Giữ inline edit kiểu Excel cho AWB, số, text, khách và CNEE.
- Thiết kế lại hierarchy, độ rộng/căn cột, sticky header/column nếu phù hợp.
- AWB và mã dùng mono; số căn phải và dùng tabular numerals.
- Focus ring, trạng thái saving/saved/error phải rõ.
- Không mất dữ liệu khi blur, chuyển hàng, nhấn Enter/Escape hoặc lỗi mạng.
- Giữ copy nhanh AWB/CNEE bằng `SelectableTextWithCopyPopover`.
- Gỡ `HoverMagnifyText / CNEE magnify`.
- Gom action theo hàng vào `ShipmentRowActionsMenu`; giữ action thật sự đang dùng như Print/TCS và phân cấp action nguy hiểm.
- `CustomerPicker / SuggestDropdown` phải giữ, hỗ trợ keyboard và dữ liệu lớn.

### 5.5. Card và chỉnh sửa mobile

- Mobile không thu nhỏ nguyên bảng desktop.
- Dùng `MobileShipmentCards`, mặc định ưu tiên:
  - AWB lớn.
  - Khách hàng.
  - Kiện/kg.
  - Kho.
  - Trạng thái.
- Chạm card mở chi tiết/chỉnh sửa.
- `MobileShipmentEditSheet` là bottom sheet có nhóm/tab:
  - Booking.
  - Thông báo.
  - DIM.
- Giữ `StickyMobileActions`, tối ưu thao tác một tay.
- Không dùng full page nếu làm tăng số bước; nếu bottom sheet quá dài hoặc gây lỗi bàn phím, ghi bằng chứng rồi đề xuất page riêng.

### 5.6. Workflow theo kho

Thay bộ 9 trạng thái bằng workflow theo kho:

| Kho | Thứ tự trạng thái |
|---|---|
| TCS | Booking → Nhận hàng → Đã đo Volume → Kéo OLA → Hoàn thành tiếp nhận → Nộp tờ cân |
| SCSC | Booking → Nhận hàng → Đã đo Volume → Kéo OLA → Nộp tờ cân |

Yêu cầu triển khai:

- Xác minh mã trạng thái đang lưu trong DB/API trước khi đổi label hoặc enum.
- Không xóa/chuyển dữ liệu lịch sử mù quáng.
- Nếu cần migration/mapping, viết kế hoạch tương thích ngược và test dữ liệu.
- Trạng thái hợp lệ phụ thuộc kho; ngăn lựa chọn sai luồng.
- `StatusFilterBar` được giữ; mobile có bản thu gọn.
- `StatusBadge / StatusSelect` phải dễ đọc từ xa, có text/icon và tương phản tốt.
- Không chỉ dựa vào màu để truyền đạt trạng thái.

### 5.7. DIM / đo volume

- Giữ `MobileDimKgModal` trên desktop và mobile, thiết kế lại từng bước.
- Giữ paste từ Excel và lưu/tải template chính.
- Rà soát preset phụ; chỉ gỡ preset không còn được sử dụng sau khi có bằng chứng.
- Gỡ speech/microphone/voice bar animation.
- Chỉ giữ numpad nếu vẫn hữu ích.
- Thiết kế lại luồng xuất `LIST DIM SCSC / Excel DIM` theo logic nghiệp vụ và tên gọi rõ.
- Kiểm thử nhập số thập phân, nhiều dòng paste, dữ liệu rỗng/sai và tổng kg/volume.

### 5.8. Import Google Sheet, xuất Excel và thông báo

- Giữ `GoogleSheetImportModal`.
- Tạo ô nhập URL riêng để người dùng thay đường dẫn mỗi lần.
- Validate URL, có trạng thái đang xử lý và không chạy import trùng.
- Thay `window.alert` bằng toast/banner:
  - Đang xử lý.
  - Thành công.
  - Thành công một phần.
  - Thất bại.
- Kết quả import hiển thị số dòng thành công/lỗi và nút “Xem lỗi”.
- Giữ xuất Excel ngày; bổ sung xuất theo ngày/khoảng ngày đã chọn từ bộ lọc.
- Tên file xuất phải có ngày hoặc khoảng ngày và kho nếu phù hợp.
- Kiểm thử timezone Việt Nam, ngày biên và dữ liệu rỗng.

### 5.9. In tem

- Giữ `PrintShippingLabel` và thermal print CSS.
- Chỉ redesign overlay, preview, chọn máy/cài đặt hiển thị nếu đã có.
- Preview responsive nhưng tỷ lệ đúng.
- Không đổi layout in thực tế khi chỉ làm đẹp UI.
- Chuyển `AirlineLabelSettingsModal` vào khu vực Settings chung nếu không làm tăng bước thao tác vận hành.
- Viết visual/regression test hoặc snapshot phù hợp cho output in.

### 5.10. ESID local (không Ext / portal / eCargo)

- Tải Ext, Đăng Nhập TCS, eCargo và Chrome extension đã gỡ — không đưa lại.
- Hồ sơ Người khai / Agent sửa qua `EsidSettingsMenu` trên thanh công cụ Ops.
- Excel eSID local (`exportEsidDeclareExcel` / `buildEsidDeclareFillPayload`) giữ nếu còn dùng nội bộ.
- Không bridge Chrome, không điền portal, không VCT/OTP.

### 5.11. Quản lý khách hàng

Thiết kế master–detail:

- Desktop:
  - Danh sách khách bên trái, tìm kiếm, bộ lọc, cuộn riêng.
  - Hồ sơ bên phải.
- Mobile:
  - Danh sách → chi tiết.
  - Nút quay lại.
  - Thanh Lưu sticky dưới đáy khi có thay đổi.
- Chia nội dung hồ sơ thành tab/section:
  - Thông tin.
  - Liên hệ.
  - Dữ liệu mặc định.
- Header cố định hiển thị dirty/saving/saved/error.
- Nút Hủy/Lưu rõ.
- Chặn mất thay đổi chưa lưu khi chuyển khách/route/đóng.
- Validation inline, focus tới lỗi đầu tiên.
- Gom Import/Export/Mẫu vào menu “Công cụ”; cân nhắc một mẫu Excel chính để giảm nút trùng.
- Xóa khách nằm trong danger zone/menu nguy hiểm và giữ confirm dialog.
- Gỡ `CustomerSavedProfilesEditor` theo quyết định trong bảng nguồn, nhưng trước khi xóa phải:
  - Tìm mọi nơi đang sử dụng.
  - Xác minh không còn phụ thuộc từ in tem/ESID.
  - Nếu vẫn có phụ thuộc, tách dữ liệu cần thiết sang “Dữ liệu mặc định” rồi mới xóa UI cũ.

## 6. Những điểm cần xác minh trước khi triển khai

Không được tự suy diễn các mục sau:

- Auth có thực sự tồn tại hay chưa.
- Tên chính xác của hai kho trong dữ liệu và mã backend.
- Enum/status hiện lưu ở đâu và có dữ liệu lịch sử không.
- Công thức KPI Lô/Kiện/Kg.
- Cấu trúc file Excel đang xuất.
- Kích thước tem thực tế và máy in đang dùng.
- Cổng TCS, ESID và Chrome extension còn hoạt động ở môi trường nào.
- `CustomerSavedProfilesEditor` có đang cấp dữ liệu cho in tem không.
- Quy tắc OLA viết hoa (`OLA`) và label nghiệp vụ chuẩn.

Ghi các câu hỏi này vào audit; chỉ hỏi người dùng những câu không thể trả lời từ code, test, dữ liệu mẫu hoặc tài liệu dự án.

## 7. Thứ tự triển khai đề xuất

### Đợt A — Nền tảng UI

- Audit.
- Semantic token.
- Typography.
- Component dùng chung.
- Light mode.
- Logo/favicon.
- Skeleton/toast/banner.

### Đợt B — OPS shell và header

- App shell.
- Header desktop/mobile.
- KPI.
- Chọn kho.
- Date filter.
- Search.
- Trạng thái Live.
- CTA booking.

### Đợt C — Dữ liệu lô

- Bảng desktop.
- Inline edit.
- Card mobile.
- Bottom sheet.
- Sticky action.
- Row action.
- Customer picker.

### Đợt D — Workflow và loại bỏ noise

- Workflow riêng TCS/SCSC với mapping an toàn.
- Status filter/chip.
- Gỡ blur/dark class lộ ra UI.
- Gỡ magnify.
- Gỡ speech/mic/animation.

### Đợt E — Khách hàng và công cụ

- CustomersPage master–detail.
- Dirty save/validation.
- Import/export khách.
- ESID settings.
- Đánh giá và gỡ `CustomerSavedProfilesEditor` an toàn.

### Đợt F — DIM, TCS, import/export và print

- DIM.
- LIST DIM/Excel DIM.
- Google Sheet URL/import result.
- Excel theo khoảng ngày.
- TCS bar/extension state.
- Preview/cài đặt in tem, regression print.

Không gộp tất cả thành một commit hoặc một lần thay đổi lớn.

## 8. Yêu cầu kiểm thử

### Tự động

- Typecheck.
- Lint.
- Unit test cho:
  - Workflow theo kho.
  - Date/range filter.
  - KPI format/tổng.
  - Validation form khách.
  - Import result mapping.
- Integration/E2E tối thiểu:
  - Tạo booking.
  - Inline edit và lưu.
  - Tìm AWB, chuyển kho, highlight.
  - Chuyển trạng thái hợp lệ theo từng kho.
  - Nhập/paste DIM.
  - Import Google Sheet thành công, một phần và lỗi.
  - Xuất Excel theo ngày/khoảng ngày.
  - In preview và output print không đổi kích thước.
  - Chỉnh khách, dirty guard, lưu, hủy và xóa có xác nhận.
- Production build.

### Thủ công/visual

Kiểm tra ít nhất:

- `375×812`, `390×844`.
- `768×1024`.
- `1280×720`.
- `1440×900`.

Các trạng thái:

- Empty.
- Loading.
- Error.
- Offline/reconnecting.
- Dữ liệu dài.
- Danh sách lớn.
- Keyboard mở trên mobile.
- Zoom trình duyệt 125% và 150%.

Truy cập:

- Keyboard-only.
- Focus visible.
- Contrast.
- Screen-reader label cơ bản.
- Không có vùng chạm dưới 44px cho action chính trên mobile.

## 9. Tiêu chí nghiệm thu

Chỉ xem là hoàn thành khi:

- Audit phản ánh đúng dự án thực tế.
- Không mất chức năng cũ ngoài ba nhóm đã quyết định gỡ: magnify, speech/mic/voice animation, `CustomerSavedProfilesEditor` sau khi xử lý phụ thuộc.
- Giao diện dùng semantic token và component chung; giảm class string trùng lặp.
- Header phẳng, sticky, không blur.
- Desktop bảng dễ quét; mobile dùng card/sheet phù hợp.
- Workflow TCS/SCSC đúng và không làm hỏng dữ liệu lịch sử.
- Import có URL riêng và báo kết quả chi tiết, không còn `window.alert`.
- Xuất Excel hỗ trợ ngày/khoảng ngày.
- Output in tem không thay đổi ngoài yêu cầu được duyệt.
- CustomersPage có master–detail, dirty state và xác nhận xóa.
- Không có lỗi type/lint/test/build mới.
- Không có console error/hydration error.
- Tài liệu cập nhật đủ để người khác tiếp quản.

## 10. Cách Cursor phải báo cáo sau mỗi đợt

Sau mỗi đợt, trả về:

1. Tóm tắt kết quả.
2. Danh sách file đã sửa.
3. Quyết định kỹ thuật quan trọng và lý do.
4. Chức năng đã giữ nguyên.
5. Test đã chạy và kết quả thực tế.
6. Screenshot/bằng chứng visual trước–sau.
7. Rủi ro hoặc việc còn lại.
8. Commit hash của đợt nếu repository dùng Git.

Không báo “hoàn thành” nếu chưa chạy test/build phù hợp.

## 11. Prompt khởi động cho Cursor

Sao chép nguyên khối dưới đây vào Cursor Agent:

```text
Hãy thực hiện Giai đoạn 0 của tài liệu
`TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md`.

Yêu cầu quan trọng:
- Chỉ nghiên cứu và tạo `docs/TECSOPS-REDESIGN-AUDIT.md`; chưa sửa UI hoặc nghiệp vụ.
- Đọc toàn bộ rule/tài liệu dự án trước.
- Khảo sát route, component, state, API, database, import/export, print, TCS/ESID và extension bridge.
- Đối chiếu từng dấu vết component trong tài liệu với file thật.
- Chạy baseline typecheck, lint, test, E2E phù hợp và production build.
- Ghi rõ lỗi có sẵn.
- Lập dependency map, risk register và kế hoạch triển khai theo Đợt A–F.
- Với nội dung không xác minh được từ code/tài liệu/test, lập danh sách câu hỏi ngắn, không tự đoán.

Khi hoàn tất audit, dừng lại và báo cáo kết quả để tôi duyệt trước khi bắt đầu Đợt A.
```

## 12. Phụ lục — Ma trận quyết định từ bảng nguồn

| Nhóm quyết định | Hạng mục |
|---|---|
| Giữ | Lazy load + Suspense; copy popover AWB/CNEE; các chức năng nghiệp vụ cốt lõi được nêu rõ |
| Redesign | 45 hạng mục còn lại liên quan shell, design system, OPS, bảng/card, workflow, DIM, import/export/print, TCS/ESID, khách hàng |
| Gỡ | Hover/CNEE magnify; speech/mic/voice animation; CustomerSavedProfilesEditor sau khi xử lý phụ thuộc |
| Chưa được phép tự thêm | Auth mới, router mới, dark mode toggle, thay schema/API, đổi layout in |

Ưu tiên thực thi được suy ra từ ảnh hưởng vận hành:

- **P0:** OPS day board, mobile OPS, booking, bảng/card lô, inline edit, workflow theo kho, KPI, tìm AWB, chọn kho, lưu dữ liệu.
- **P1:** Design system, header, import/export, CustomersPage, DIM, print preview/regression, trạng thái kết nối.
- **P2:** Logo/favicon, gom settings/ESID, tinh chỉnh preset và action thứ cấp.
- **P3/đánh giá sau:** Dark mode. Không đưa lại Ext / portal TCS / eCargo.
