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
- [ ] Giai đoạn 2: Optimistic UI + outbox (`src/hooks/useShipmentSync.ts`)
- [ ] Giai đoạn 3: Điều hướng kiểu Excel (`src/hooks/useGridNavigation.ts`)
- [ ] Giai đoạn 4: Lật trang + mobile snap
- [ ] Giai đoạn 5: Outbox bền vững (P1)
- [ ] Giai đoạn 6: Copy/dán Excel + Undo (P1)
- [ ] Giai đoạn 7: Virtual scroll (P1)
- [ ] Giai đoạn 8: E2E Playwright
- [ ] Kết thúc: Lint, typecheck, test, REPORT.md
