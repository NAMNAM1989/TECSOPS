# TECSOPS UI Review — Ops / Customers / Stats redesign

> Cập nhật: 2026-08-22 · Round 3 mobile-first Ops (sau PR #40 Round 2)

## Round 3 — Mobile Ops monitoring + sync

| Mục tiêu | Thay đổi |
| --- | --- |
| Sync visible | `OpsMobileSyncBar` sticky: Live / Hạn chế / Offline / Đang đồng bộ + «đã sync lúc HH:mm:ss» + CTA Làm mới/Thử lại |
| Chrome thấp | Kho = chip 1 hàng (không lưới 2×2); copy ảnh gộp menu «Ảnh»; KPI theo kho đang chọn |
| Lot density | Card denser: AWB+status · khách/chuyến/DEST · K/Kg; expand CNEE; `contentVisibility` |
| Safe area | FAB trên BottomNav; padding list `8.25rem + safe-area` |
| Touch | Status filter / status select / kho chip ≥44px |
| eCargo | Badge từ `ecargoVctResultsStore`: Đã Cấp VCT / Mã xác thực / eCargo… / lỗi (không invent Đình Chỉ) |
| Copy | Giữ «Đăng Nhập TCS» / «Thử Đăng Nhập TCS» — không «ĐN» |

### Sync source of truth

- Client **không** có `lots.synced_at` / `ops_customers.synced_at` trong types/API hiện tại.
- Round 3 dùng best-effort `lastSyncAt` từ socket/API client (`useShipmentSync`).
- TODO (ngoài PR): thin view/API Supabase `synced_at` nếu cần SoT DB.

### eCargo / Đình Chỉ

- Có field VCT status/code trong store → badge compact.
- Không có field «Đình Chỉ» trên lot model → không fake badge (TODO nếu Gmail ops cần).

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

## Không đụng

- Xóa credential / rewrite Railway / Playwright
- Đổi workflow enum / migration status / schema
- Print tem CSS `@page` / mm
- Schema / API migration
