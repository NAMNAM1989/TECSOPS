# TECSOPS UI Review — Ops / Customers / Stats redesign

> Cập nhật: 2026-08-22 · Round 3.2 alert→Toast + CTA Đăng Nhập TCS

## Round 3.2 — Alert → Toast + CTA login

| Finding (#39 P0) | Fix |
| --- | --- |
| `window.alert` chặn UI (portal / AWB / export / in) | `src/ui/notify.ts` → Toast; export/print/CSD/DIM không còn `window.alert` |
| Mobile ẩn CTA khi agent/ext fail (cổng thu gọn) | Header collapsed vẫn hiện «Đăng Nhập TCS» / «Thử Đăng Nhập TCS»; login fail Toast |
| Copy «ĐN» | `tcsLoginCtaLabel` — luôn cụm đầy đủ |

P1 lite: EmptyState khi lọc không khớp; Excel thống kê dùng `statusLabel`.

Follow-up: `notify` → Toast dùng `TOAST_DURATION_MS` theo tone (warning 5600 / danger 6400), không còn đóng sớm 4200ms.

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

- SoT namnamlogistics: `lots.synced_at` + `ops_customers.synced_at` (timestamptz, 0 null tại thời điểm wire).
- API: `/api/state` overlay + `GET /api/sync-meta` SELECT cả hai bảng. Không migration.
- **Ops strip ≠ Customers strip** — không gộp max lots với customers.
- Ops: `max(synced_at)` lô **kho đang xem + ngày phiên**; nếu không có field trên row → `syncMeta.lotsMaxSyncedAtByWarehouse[kho]`. Không `lastSyncAt` client.
- Customers: `max(ops_customers.synced_at)` / `customers.syncedAt` thôi.
- Format `Asia/Saigon` «đã sync lúc HH:mm:ss». Null/thiếu → ẩn timestamp (không epoch / Invalid Date).

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

## P0 từ #39 — đã xử lý Round 3.2

| Finding | Fix |
| --- | --- |
| `window.alert` chặn UI | Toast non-blocking (`notify` + ToastProvider) |
| Mobile ẩn CTA khi agent fail | Hiện «Đăng Nhập TCS» / «Thử Đăng Nhập TCS» cả khi cổng thu gọn |
| Copy user-visible dùng «ĐN» | Luôn «Đăng Nhập TCS» (`tcsLoginCtaLabel`) |

## Không đụng

- Xóa credential / rewrite Railway / Playwright
- Đổi workflow enum / migration status / schema
- Print tem CSS `@page` / mm
- Schema / API migration
