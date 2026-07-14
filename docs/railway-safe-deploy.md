# Triển khai Railway an toàn (TECSOPS)

Dự án **không dùng Prisma / Sequelize**. Nguồn sự thật là Railway Postgres:

- Dữ liệu chính nằm trong các bảng quan hệ như `shipments`, `customers`, `customer_*`.
- `app_state` giữ snapshot JSON tương thích và các phần catalog chưa tách bảng; `state_meta` giữ version.
- Biến **`DATABASE_URL`** là bắt buộc; key snapshot mặc định là `tecsops:state`.
- **Không** dùng Redis, file container, hay demo seed làm nguồn sự thật.

Vì vậy:

- Không có Prisma migration — server tự bảo đảm schema bằng `CREATE TABLE IF NOT EXISTS`.
- Backup trước mỗi đợt deploy quan trọng; **không drop/reset DB**; **không ghi đè state khi parse lỗi**.
- Thiếu `DATABASE_URL` → process **thoát ngay** (FATAL).

---

## 1. Biến môi trường

| Biến | Ý nghĩa |
|------|--------|
| **`DATABASE_URL`** | Bắt buộc — URL từ Railway Postgres. |
| **`POSTGRES_STATE_KEY`** | Tùy chọn — mặc định `tecsops:state`. |
| **`PORT`** | Railway inject sẵn. |
| **`NODE_ENV`** | `production` khi build Nixpacks. |
| **`GOOGLE_SHEETS_BOOK_SPREADSHEET_ID`** | Tùy chọn — import BOOK Hằng Ngày. |

Socket.IO chạy **in-memory** — khuyến nghị **1 replica**.

---

## 2. Quy trình deploy an toàn

```bash
npm run deploy:ship
```

Chạy `build` + `test` + `deploy:check`, rồi `git push`. Railway deploy từ nhánh **`main`**.

1. **Backup Postgres** trước deploy quan trọng: `npm run backup:postgres-state`
2. **Start:** `npm run start:railway` (= `deploy:check` + `node server/index.mjs`)
3. **Không seed** lúc start — state trống bootstrap thành `{ rows: [], customers: [] }`

---

## 3. Script chính

| Script | Vai trò |
|--------|--------|
| `start` / `start:railway` | Chạy server |
| `deploy:check` / `deploy:ship` | An toàn + ship |
| `backup:postgres-state` / `restore:postgres-state` | Backup / khôi phục state chuẩn hóa qua cả bảng quan hệ và snapshot |
| `migrate:postgres-state` | One-shot migrate từ nguồn cũ (Redis/file) nếu còn |

---

## 4. Healthcheck

`GET /api/health` kiểm tra cả process và kết nối Postgres:

- `200` → `{ ok: true, service: "tecsops", storage: { postgres: true } }`
- `503` → `{ ok: false, service: "tecsops", storage: { postgres: false } }`
