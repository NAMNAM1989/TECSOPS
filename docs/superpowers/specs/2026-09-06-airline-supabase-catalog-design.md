# Airline catalog from Supabase — Design

**Date:** 2026-09-06  
**Status:** Approved for implementation

## Goal

TECSOPS lấy master hãng bay từ Supabase project `cuakkgauyutapdznqhge` (`public.airlines`) để resolve tên in tem / lookup. Không còn trang quản lý `#/airlines` trên nav.

## Decisions

| Topic | Choice |
|---|---|
| Approach | Client đọc thẳng Supabase (anon/publishable + RLS) |
| Sync cadence | Một lần khi cache trống; re-sync thủ công khi cần |
| Re-sync overwrite | Ghi đè toàn bộ cache local |
| Label name field | `name` (full) |
| UI surface | Bỏ nav/trang Hãng; nút đồng bộ ở menu phụ Ops |
| Offline | Dùng `localStorage` cache sau lần fetch đầu; chưa sync → fallback defaults cứng tạm thời |

## Architecture

1. Browser gọi Supabase REST: `GET /rest/v1/airlines?select=...&status=eq.ACTIVE`
2. Normalize → `{ byFlightPrefix: iata→name, byAwbPrefix: awb→name }`
3. Cache versioned trong `localStorage`
4. Print/lookup đọc cache này (không SoT qua `airlineLabelOverrides` server)
5. Nút **Đồng bộ hãng bay** xóa cache + fetch lại

## Env

- `VITE_DATA_SUPABASE_URL=https://cuakkgauyutapdznqhge.supabase.co`
- `VITE_DATA_SUPABASE_ANON_KEY=` (publishable/anon — không commit giá trị thật)

## Error handling

- Thiếu env → không fetch; giữ fallback defaults; nút sync báo cấu hình thiếu
- HTTP/RLS lỗi → toast; giữ cache cũ nếu có
- AWB null → chỉ map IATA

## Out of scope

- CRUD master trên TECSOPS
- Sync định kỳ nền
- Ghi Postgres airline catalog từ Supabase (server-side)
- Xóa hoàn toàn server `airlineLabelOverrides` persistence (có thể còn trong state blob; UI/print không dùng làm SoT)
