# TECSOPS UI Review — Ops / Customers / Stats redesign

> Cập nhật: 2026-08-22 · Round 2 Operational Signal (sau PR #39)

## Round 2 — nâng cấp hình ảnh

| Mục tiêu | Thay đổi |
| --- | --- |
| Token / hierarchy | Canvas lạnh + radial nhẹ; primary `#0F766E`; AWB `ui-awb`; shadow `ui-sm/md/lg`; zebra + sticky header bảng |
| Ops mobile | Sticky header thấp hơn; KPI / copy chip gọn; kho chip viền trái màu; card lô shadow + AWB contrast |
| Ops desktop | Bảng zebra sạch, hover teal nhẹ, header sticky gradient, pill status bo tròn |
| Khách hàng | Directory accent trái; form card nâng; danger zone rõ hơn; empty rõ ràng |
| Thống kê | KPI card gradient tone; chart/table đồng bộ token Ops |
| A11y | `:focus-visible` global; focus ring giữ trên control chính |

## P0 từ #39 (giữ nguyên)

| Finding | Fix |
| --- | --- |
| `window.alert` chặn UI | Toast non-blocking |
| Mobile ẩn CTA khi agent fail | Hiện «Đăng Nhập TCS» / «Thử Đăng Nhập TCS» |
| Copy user-visible dùng «ĐN» | Luôn «Đăng Nhập TCS» |

## P1 từ #39 (giữ nguyên)

| Finding | Fix |
| --- | --- |
| 3 lớp nhãn status lệch | Một nguồn `statusLabel` + compact cùng gốc |
| Khách / Thống kê trên phone | `BottomNav` Ops · Khách · Thống kê |
| Dirty confirm Customers | `ConfirmDialog` |

## Không đụng

- Xóa credential / rewrite Railway / Playwright
- Đổi workflow enum / migration status
- Print tem CSS `@page` / mm
- Schema / API migration
