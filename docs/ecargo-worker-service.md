# eCargo worker — tách service trên Railway

TECSOPS chạy automation eCargo (Playwright + Gmail) trong cùng process với web server. Khi tải tăng hoặc job Playwright chạy lâu, có thể **tách worker** sang service Railway riêng mà vẫn dùng chung Postgres/Redis.

## Kiến trúc hiện tại (monolith)

```
Browser ──► Express (server/index.mjs)
              ├── REST + Socket.IO
              ├── stateStore (Postgres / Redis)
              └── startEcargoWorker()  ← BRPOP queue, Playwright, Gmail
```

- Hàng đợi Redis: key `ECARGO_QUEUE_KEY` (xem `server/ecargo/ecargoConfig.mjs`).
- Trạng thái job: `ecargoJobStore.mjs` (Redis hash theo `shipmentId`).
- UI nhận cập nhật qua event Socket.IO `ecargo-job`.

## Tách worker (khuyến nghị khi scale)

```
Service A — Web          Service B — eCargo worker
  ECARGO_WORKER_ENABLED=0   ECARGO_WORKER_ENABLED=1
  Playwright không cần      playwright install chromium
  DATABASE_URL + REDIS_URL    cùng DATABASE_URL + REDIS_URL
```

| Biến | Web service | Worker service |
|------|-------------|----------------|
| `DATABASE_URL` | Bắt buộc (hoặc `REDIS_URL` nếu chưa migrate) | Giống web — dùng `runMutation` khi cập nhật shipment |
| `REDIS_URL` | Bắt buộc nếu bật eCargo queue | Bắt buộc |
| `ECARGO_WORKER_ENABLED` | `0` | `1` (mặc định khi có Redis) |
| `ECARGO_*` Gmail / SCSC | Có thể bỏ trên web nếu worker xử lý mail | Đầy đủ credentials eCargo + Gmail |

Worker **không** cần expose port công khai; chỉ cần kết nối Redis/Postgres và outbound HTTPS (eCargo, Gmail IMAP).

## Triển khai Railway

1. **Service web** (service hiện tại): thêm `ECARGO_WORKER_ENABLED=0` trong Variables.
2. **Service worker mới** — cùng repo, branch `main`:
   - Start command: `node server/ecargo/ecargoWorkerStandalone.mjs` *(entry point tách — hiện dùng `node server/index.mjs` với `ECARGO_WORKER_ENABLED=1` và có thể tắt HTTP nếu cần)*.
   - Build: giữ `npx playwright install chromium` như `railway.toml`.
   - Không healthcheck HTTP (hoặc healthcheck nội bộ Redis ping).
3. Chạy `node scripts/railway-set-ecargo-env.mjs` cho service worker (Gmail, mật khẩu SCSC, v.v.).

> **Lưu ý:** Hiện `server/index.mjs` vẫn khởi động cả HTTP lẫn worker. Bước tiếp theo (tùy chọn) là thêm `ECARGO_WORKER_ONLY=1` để worker service không bind `PORT`. Tài liệu này mô tả hướng tách; monolith vẫn hoạt động mặc định.

## Tắt worker tạm thời

```bash
ECARGO_WORKER_ENABLED=0
```

API vẫn enqueue job; job nằm trong Redis cho đến khi bật lại worker.

## Kiểm tra sau deploy

1. `GET /api/health` — web service OK.
2. Tạo job eCargo từ UI — status chuyển `queued` → `filling` (worker đang chạy).
3. Logs worker: `[ecargo] Worker tắt` **không** xuất hiện trên service worker.

## Liên quan

- [railway-safe-deploy.md](./railway-safe-deploy.md) — backup Postgres/Redis trước deploy.
- `.cursor/skills/tecsops-railway-state-persistence/SKILL.md` — giữ state khi tách replica.
