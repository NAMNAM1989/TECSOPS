# TECSOPS UI Review — Ops / Customers / Stats redesign

> Cập nhật: 2026-08-22 · PR redesign Operational Signal

## P0 đã xử lý

| Finding | Fix |
| --- | --- |
| `window.alert` chặn UI khi portal / AWB / Ext / ngày bay | Toast non-blocking (`TcsPortalInlineBar`, `InlineAwbEdit`, `ChromeExtensionsDownloadMenu`, `DesktopShipmentTable`) |
| Mobile ẩn CTA khi agent fail | Hiện «Đăng Nhập TCS» / «Thử Đăng Nhập TCS» khi chưa login, kể cả agent offline |
| Copy user-visible dùng «ĐN» | Đổi thành «Đăng Nhập TCS» trên bar + message hook portal |

## P1 đã xử lý

| Finding | Fix |
| --- | --- |
| 3 lớp nhãn status lệch (filter / select / compact) | Một nguồn `statusLabel`; compact cùng gốc từ vựng; dense filter dùng compact |
| Khách / Thống kê khó tìm trên phone | `BottomNav` Ops · Khách · Thống kê |
| Dirty confirm Customers dùng `window.confirm` | `ConfirmDialog` |
| Design system thiếu | Thêm `Badge`, `Card`, `Input`, `BottomNav`, `ConfirmDialog` |
| Stats / mobile cards / KPI | Làm phẳng, bỏ blur/gradient thừa, card lô bo góc + shadow nhẹ |

## Không đụng trong PR này

- Xóa credential / rewrite Railway / Playwright stack
- Đổi workflow enum / migration status lịch sử
- Print tem CSS `@page` / mm
