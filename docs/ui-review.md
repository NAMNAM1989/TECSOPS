# TECSOPS UI Review — Ops / Customers / Stats redesign

> Cập nhật: 2026-08-25 · gỡ Tải Ext / Đăng Nhập TCS / eCargo. Round 3.2 trở về trước là nhật ký — CTA portal không còn trên Ops.

## Round 3.2 — Alert → Toast + CTA login

| Finding (#39 P0) | Fix |
| --- | --- |
| `window.alert` chặn UI (portal / AWB / export / in) | `src/ui/notify.ts` → Toast; export/print/CSD/DIM không còn `window.alert` |
| Mobile ẩn CTA khi agent/ext fail (cổng thu gọn) | **Đã gỡ 2026-08-25** — không còn thanh cổng / CTA portal |
| Copy «ĐN» | Không viết tắt ĐN. Không còn CTA portal trên Ops. |

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
| eCargo | **Đã gỡ 2026-08-25** — không badge VCT / modal đăng ký |
| Portal TCS | **Đã gỡ 2026-08-25** — không thanh cổng, không Quét/Điền/PDF qua Ext |
| Copy | Không viết tắt ĐN. Không còn CTA portal. |

### Sync source of truth

- SoT namnamlogistics: `lots.synced_at` + `ops_customers.synced_at` (timestamptz, 0 null tại thời điểm wire).
- API: `/api/state` overlay + `GET /api/sync-meta` SELECT cả hai bảng. Không migration.
- **Ops strip ≠ Customers strip** — không gộp max lots với customers.
- Ops: `max(synced_at)` lô **kho đang xem + ngày phiên**; nếu không có field trên row → `syncMeta.lotsMaxSyncedAtByWarehouse[kho]`. Không `lastSyncAt` client.
- Customers: `max(ops_customers.synced_at)` / `customers.syncedAt` thôi.
- Format `Asia/Saigon` «đã sync lúc HH:mm:ss». Null/thiếu → ẩn timestamp (không epoch / Invalid Date).

### eCargo / portal TCS — đã gỡ (2026-08-25)

- Không badge VCT, không modal eCargo, không Tải Ext, không thanh Đăng Nhập TCS.
- 4 mã kho + DIM / in / CSD / ảnh báo cáo / ESID local (`EsidSettingsMenu`) giữ nguyên.

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
| Mobile ẩn CTA khi agent fail | **Đã gỡ** thanh cổng / CTA portal |
| Copy user-visible dùng «ĐN» | Không viết tắt ĐN; không còn CTA portal |

## Không đụng

- Xóa credential / rewrite Railway / Playwright
- Đổi workflow enum / migration status / schema
- Print tem CSS `@page` / mm
- Schema / API migration
