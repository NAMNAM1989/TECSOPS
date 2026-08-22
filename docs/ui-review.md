# TECSOPS UI Review — Ops / Customers / Stats redesign

> Cập nhật: 2026-08-22 · Round 3.1 occlusion fix (PR #41)

## Round 3.1 — Mobile occlusion

| Mục tiêu | Thay đổi |
| --- | --- |
| Sheet Lưu/Hủy | `z-[560]` > BottomNav `z-500`; footer + safe-area + `visualViewport` keyboard inset |
| Ẩn chrome khi sheet | `html[data-ops-mobile-overlay=sheet]` → BottomNav + FAB invisible; hook `useOpsMobileOverlayLock` |
| List lô | `pb` / `scroll-mb` ≈ `10.5rem + safe-area` — status/⋮ không bị FAB che |
| Header thấp hơn | Sync Live 1 hàng; `space-y-0.5`; AppShell padding giảm |
| Customers | Sticky Lưu/Hủy `pb` đủ cao trên BottomNav |
| DIM / Sheet import | Cùng z-index + overlay lock |

## Round 3 — Mobile Ops monitoring + sync

| Mục tiêu | Thay đổi |
| --- | --- |
| Sync visible | `OpsMobileSyncBar` sticky: Live / Hạn chế / Offline / Đang đồng bộ + «đã sync lúc HH:mm:ss» + CTA Làm mới/Thử lại |
| Chrome thấp | Kho = chip 1 hàng (không lưới 2×2); copy ảnh gộp menu «Ảnh»; KPI theo kho đang chọn |
| Lot density | Card denser: AWB+status · khách/chuyến/DEST · K/Kg; expand CNEE; `contentVisibility` |
| Safe area | FAB trên BottomNav; padding list `8.25rem + safe-area` |
| Touch | Status filter / status select / kho chip ≥44px |
| eCargo | Badge từ `ecargoVctResultsStore` (Đã Cấp VCT / Mã xác thực) — không mở rộng portal |
| Portal TCS | **Không** mở rộng agent/ext/PW; thanh cổng **thu gọn mặc định** trên mobile (giảm chrome) |
| Copy | Nếu CTA login còn hiện: «Đăng Nhập TCS» — không «ĐN» |

### Sync source of truth

- Client **không** có `lots.synced_at` / `ops_customers.synced_at` trong types/API hiện tại.
- Round 3 dùng best-effort `lastSyncAt` từ socket/API client (`useShipmentSync`).
- TODO (ngoài PR): thin view/API Supabase `synced_at` nếu cần SoT DB.

### eCargo / Đình Chỉ

- Có field VCT status/code trong store → badge compact.
- Không có field «Đình Chỉ» trên lot model → không fake badge (TODO nếu Gmail ops cần).

### TCS / TECS-TCS — không xóa trong Round 3

Chờ keep/delete list từ inventory GitHub. Ứng viên cleanup (follow-up PR):

- `TcsPortalInlineBar` / `useTcsPortalActions` / agent·ext·PW controls trên mobile
- Chrome Ext TECS-TCS + routes `/tcs-agent` UI surface trong Ops header
- Menu ESID / Quét / Đăng Nhập TCS nếu kho TCS bị sunset
- `docs/ecargo-vct-otp-flow.md` tách khỏi TCS portal (eCargo = SCSC)

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
