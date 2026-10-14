# TIẾN ĐỘ THỰC HIỆN BẢNG NHẬP LIỆU MƯỢT (SMOOTH TABLE)

## 0. Khởi tạo & Snapshot ban đầu
- Trạng thái uncommitted từ `main` trước khi switch branch:
  - `src/components/DesktopShipmentTable.test.tsx`
  - `src/components/DesktopShipmentTable.tsx`
  - `src/components/InlineCustomerInfoCell.tsx`
- Branch: `feat/smooth-table`

## Bảng theo dõi các giai đoạn
- [x] Giai đoạn 1: Sửa re-render (`src/components/DesktopShipmentTable.tsx`)
  - Bỏ `groupRowIds` khỏi props `ShipmentTableRow`, thay bằng `getNeighborRowId(id, dir)` ổn định qua `useCallback` + `useRef`.
  - Cập nhật comparator memo: `shipmentRowRenderEqual` + props ổn định.
  - Viết test trong `DesktopShipmentTable.test.tsx`: đổi 1 lô qua sync chỉ row đó re-render, memo giữ nguyên DOM node row không đổi.
  - Lint & typecheck & test pass.
- [x] Giai đoạn 2: Optimistic UI + outbox (`src/hooks/useShipmentSync.ts`)
  - Chấm trạng thái ô `CellStatusDot.tsx` (xám nhấp nháy: pending, đỏ: lỗi, idle: ẩn).
  - Loại bỏ hoàn toàn loading spinner và disabled input khi commit; đóng ô ngay lập tức.
  - Xây dựng outbox gộp patch UPDATE cùng ID (`consolidateOutboxMutations`), remap ID sau ADD, rollback đúng 1 field khi lỗi.
  - Socket sync đến giữ nguyên các ô đang pending (`applyPendingPatchesOverServerState`).
  - Gửi batch `POST /api/mutations` với debounce 150ms hoặc chạm ngưỡng 10 mutations.
  - Toast thông báo lỗi kèm nút "Thử lại".
  - Viết unit test `src/utils/shipmentOutbox.test.ts` (4 test pass).
  - Typecheck, lint, vitest pass. Commit `dffd9a0`.
- [x] Giai đoạn 3: Điều hướng kiểu Excel (`src/hooks/useGridNavigation.ts`)
  - Hook `useGridNavigation` quản lý thứ tự 10 cột `TABLE_COLUMN_ORDER` (`awb` → `hawb` → `flight` → `flightDate` → `dest` → `pcs` → `kg` → `dimKg` → `customer` → `note`).
  - Active cell viền 2px (`box-shadow: 0 0 0 2px var(--color-ui-focus)`).
  - Không edit: mũi tên 4 chiều di chuyển ô; Tab/Shift+Tab di chuyển sang phải/trái (hết dòng nhảy dòng kế); Enter/F2 vào edit; gõ ký tự vào edit và thay nội dung (giữ `N` và `/` khi ngoài input).
  - Đang edit: Enter = commit + xuống cùng cột; Tab/Shift+Tab = commit + phải/trái; Esc = huỷ, trả giá trị cũ, 0 mutation.
  - Viết unit test `src/hooks/useGridNavigation.test.ts` (5 test pass).
  - Typecheck, lint, vitest pass. Commit `168a63a`.
- [x] Giai đoạn 4: Lật trang + mobile snap
  - Nút công tắc «Cuộn thường / Lật trang» trên toolbar bảng, lưu `localStorage` key `tecsops.scrollMode`, mặc định `normal`.
  - Desktop: chế độ Lật trang bắt phím PageDown/PageUp (và Space nếu cấu hình), tính toán lật đúng 1 màn dòng thẳng mép sticky header với easing `cubic-bezier(.2,.8,.2,1)` thời lượng 220ms qua rAF (`src/utils/pageFlipAnimation.ts`).
  - Hỗ trợ `prefers-reduced-motion: reduce` cuộn ngay không animation.
  - Mobile: container `snap-y snap-proximity overscroll-contain`, mỗi card `snap-start`, đảm bảo touch target ≥ 44px (`min-h-11`).
  - Viết unit test `src/utils/pageFlipAnimation.test.ts` (7 test pass).
  - Typecheck, lint, vitest pass. Commit `d5d6641`.
- [x] Giai đoạn 5: Outbox bền vững (P1)
  - Lưu trữ mutation ngoại tuyến và outbox qua IndexedDB (`tecsops_db`), có cơ chế fallback `localStorage` an toàn (`src/utils/persistentOutbox.ts`).
  - Nạp lại mutation khi khởi tạo `useShipmentSync`, giữ nguyên thứ tự `enqueuedAt` và hợp nhất không trùng lặp.
  - Hiển thị badge «N thay đổi chờ gửi» trên SyncStatusPill (cả trạng thái live, degraded, và offline).
  - Viết unit test `src/utils/persistentOutbox.test.ts` (3 test pass).
  - Typecheck, lint, vitest pass. Commit `9fa62e7`.
- [x] Giai đoạn 6: Copy/dán Excel + Undo (P1)
  - Parser TSV chuẩn RFC-4180/Excel (`src/utils/tsvParser.ts`) hỗ trợ tab, xuống dòng trong ngoặc kép `""`, CRLF/LF.
  - Quản lý Undo/Redo stack giới hạn 20 thao tác (`src/utils/tableUndoManager.ts`).
  - Mapper dán vùng (`src/utils/tablePasteMapper.ts`) map TSV từ ô activeCell qua các cột `TABLE_COLUMN_ORDER`, tính forward và reverse mutations; tôn trọng `PASTE_CREATES_ROWS = false` bỏ qua các dòng vượt quá bảng hiện tại.
  - Modal xem trước dán (`src/components/PastePreviewModal.tsx`) hiện tóm tắt số lô và bảng so sánh trước/sau khi dán > 1 dòng trước khi xác nhận.
  - Tích hợp phím tắt Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z trong `DesktopShipmentTable.tsx`.
  - Viết unit test: `tsvParser.test.ts` (5 test pass), `tablePasteMapper.test.ts` (3 test pass), `tableUndoManager.test.ts` (3 test pass).
  - Typecheck, lint, vitest pass.
- [x] Giai đoạn 7: Virtual scroll (P1)
  - Xây dựng hook `useVirtualScroll.ts` ảo hoá danh sách tối ưu riêng cho table DOM (`src/hooks/useVirtualScroll.ts`).
  - Tự động kích hoạt khi số dòng > `VIRTUALIZE_THRESHOLD` (100 dòng); dưới ngưỡng này render thông thường overhead = 0.
  - Chiều cao dòng ~56px, `overscan: 8`, giữ nguyên `thead` sticky top-0 và cột AWB sticky left-0 bằng kỹ thuật spacer tr chuẩn HTML table.
  - Lưu và khôi phục vị trí cuộn qua `sessionStorage` (`tecsops.scrollPos.<sessionDate>.<warehouse>`).
  - Tích hợp `onBeforeFocus` vào `useGridNavigation`: tự động gọi `scrollToIndex` trước khi focus vào ô nằm ngoài viewport ảo.
  - Viết unit test: `useVirtualScroll.test.ts` (3 test pass), `DesktopShipmentTable.virtual.test.tsx` (1 test pass: 2.000 dòng render DOM < 80 thẻ `<tr>`).
  - Typecheck, lint, vitest pass.
- [x] Giai đoạn 8: E2E Playwright
  - Xây dựng suite E2E thực chiến `tests/e2e/smooth-table.mjs` bao quát 5 kịch bản:
    1. ST-01: Điều hướng bàn phím hoàn toàn không dùng chuột (ArrowRight, Tab, Enter).
    2. ST-02A: Optimistic UI khi mạng chậm (ô đóng ngay lập tức, không loading spinner).
    3. ST-03: Rollback khi server trả 500 (hiện toast lỗi kèm nút "Thử lại", khôi phục giá trị cũ).
    4. ST-04A: Chế độ Lật trang (nút chuyển đổi và cuộn mượt).
    5. ST-05: Mobile view snap scroll proximity và touch targets >= 44px.
  - Thêm script `npm run test:e2e:smooth`.
  - Kết quả: PASS toàn bộ 5/5 kịch bản.
- [ ] Kết thúc: Lint, typecheck, test, REPORT.md
