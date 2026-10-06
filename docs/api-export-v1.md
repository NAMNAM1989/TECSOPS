# Export API v1 — lấy dữ liệu TECSOPS cho app ngoài

API **ổn định** (versioned), đọc **thẳng Postgres** (bảng `shipments` / `customers`), không đi qua blob `/api/state` nên nhanh và đúng SoT hơn.

## Auth

Giống app web:

```http
Authorization: Bearer <TECSOPS_APP_TOKEN>
```

hoặc header `X-TECSOPS-Token: <TECSOPS_APP_TOKEN>`.

Gọi **server-to-server**. Nếu gọi từ browser domain khác, set `CORS_ORIGINS` (hoặc `EXPORT_CORS_ORIGINS`) trên TECSOPS.

## Endpoints

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/export/meta` | version schema + `stateVersion` |
| GET | `/api/v1/export/shipments` | danh sách lô (bắt buộc filter) |
| GET | `/api/v1/export/shipments/:id` | một lô |
| GET | `/api/v1/export/customers` | danh bạ khách (rút gọn) |

### Shipments — query

Bắt buộc **một** trong: `sessionDate`, `awb`, `id`.

| Param | Ví dụ | Ghi chú |
|---|---|---|
| `sessionDate` | `2026-09-12` | YYYY-MM-DD — khuyến nghị mặc định |
| `warehouse` | `TECS-TCS` | `TECS-TCS` \| `TECS-SCSC` \| `TCS` \| `SCSC` |
| `status` | `PENDING` | exact |
| `awb` | `618-54405131` | khớp số hoặc digits |
| `id` | `s-1` | id nội bộ |
| `view` | `core` (mặc định) \| `full` | `full` kèm field in ấn |
| `limit` | `500` (max `2000`) | |
| `cursor` | opaque | trang tiếp theo |

### Customers — query

`q`, `code`, `id`, `limit` (mặc định 200).

## Envelope ổn định

```json
{
  "ok": true,
  "apiVersion": "v1",
  "schemaVersion": 1,
  "resource": "shipments",
  "stateVersion": 42,
  "generatedAt": "2026-09-12T04:00:00.000Z",
  "query": { "sessionDate": "2026-09-12", "view": "core" },
  "count": 1,
  "shipments": [ { "id": "...", "awb": "...", "warehouse": "TECS-TCS", "status": "PENDING" } ],
  "nextCursor": null
}
```

- Tăng `schemaVersion` khi đổi field/ý nghĩa.
- `stateVersion` tăng mỗi lần dữ liệu TECSOPS đổi (dùng cache/`ETag`).

## Cache / tốc độ

- Response có `ETag: W/"tecsops-export-v{stateVersion}"`.
- Client gửi `If-None-Match` → `304` nếu chưa đổi.
- Index: `(session_date, warehouse)`, `awb`, `(session_date, status)`.

## Ví dụ

```bash
curl -sS -H "Authorization: Bearer $TECSOPS_APP_TOKEN" \
  "https://YOUR_HOST/api/v1/export/shipments?sessionDate=2026-09-12&warehouse=TECS-TCS"
```

```js
const res = await fetch(
  `${TECSOPS_URL}/api/v1/export/shipments?sessionDate=2026-09-12`,
  { headers: { Authorization: `Bearer ${process.env.TECSOPS_APP_TOKEN}` } },
);
if (res.status === 304) { /* dùng cache local */ }
const { shipments, stateVersion, nextCursor } = await res.json();
```

## Không dùng endpoint này để

- Ghi / sửa dữ liệu (dùng `/api/mutation` nếu thật sự cần — không khuyến nghị cho app ngoài).
- Thay `/api/state` cho UI TECSOPS (UI vẫn dùng state + socket).
