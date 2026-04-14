# Triển khai Railway an toàn (TECSOPS)

Dự án **không dùng Prisma / Sequelize / PostgreSQL**. Toàn bộ “database” ứng dụng là **một JSON trạng thái** (shipments) lưu ở:

- **Production (khuyến nghị):** Redis — biến **`REDIS_URL`** do plugin Redis trên Railway cung cấp.
- **Fallback / dev:** file `server/data/state.json` (qua **`DATA_DIR`**) — **ổ đĩa container Railway là không bền**; không dùng làm nơi dữ liệu tồn tại lâu dài nếu không gắn **Volume**.

Vì vậy:

- Không có `prisma migrate deploy` hay migration SQL trong repo — mọi yêu cầu “migration không phá dữ liệu” được đảm bảo bằng **không ghi đè state Redis khi parse lỗi** và **không dùng lệnh sync/force** trong triển khai.
- Nếu sau này thêm PostgreSQL, hãy dùng migration additive (`prisma migrate deploy`) và **không** commit script có `--force-reset` / `sync({ force: true })`.

---

## 1. Biến môi trường

| Biến | Ý nghĩa |
|------|--------|
| **`REDIS_URL`** | Bắt buộc cho production ổn định — URL từ Railway Redis. |
| **`PORT`** | Railway inject sẵn — app đã `listen(PORT)`. |
| **`NODE_ENV`** | `production` khi build Nixpacks. |
| **`TECSOPS_DISABLE_DEMO_SEED=1`** | Khi Redis/file **trống lần đầu**, tạo state **rỗng** `{ rows: [] }` thay vì seed từ `initialRows.json`. |
| **`REDIS_STATE_KEY`** | Tùy chọn — mặc định `tecsops:state`. |
| **`DATABASE_URL`** | **Hiện không dùng** bởi app; có thể dành cho tương lai. |

**Không** lưu dữ liệu quan trọng chỉ trên filesystem container nếu không có Volume.

---

## 2. Quy trình deploy an toàn

1. **Backup Redis (khuyến nghị trước mỗi đợt deploy quan trọng)**  
   Trên máy có `REDIS_URL` (hoặc tạm thời lấy từ Railway):
   ```bash
   npm run backup:redis-state
   ```
   Hoặc dùng snapshot/backup của plugin **Redis** trên Railway (nếu có).

2. **Deploy**  
   `railway.toml` dùng:
   ```bash
   npm run start:railway
   ```
   Script này chạy **`scripts/check-deploy-safe.mjs`** (chặn pattern phá dữ liệu kiểu `prisma migrate reset`, `sync({ force: true })`, v.v. trong `package.json` / `railway.toml`) rồi mới `node server/index.mjs`.

3. **Không có bước “seed” deploy**  
   App **không** chạy script seed khi start. Seed demo chỉ xảy ra khi state **chưa tồn tại** (Redis trống và không migrate được từ file), trừ khi bật `TECSOPS_DISABLE_DEMO_SEED=1`.

4. **Dữ liệu Redis hỏng**  
   Nếu giá trị tại key state không parse được, app **sẽ thoát** (fail fast) và **không tự ghi đè bằng dữ liệu demo** — cần khôi phục từ backup.

---

## 3. Script trong `package.json`

| Script | Vai trò |
|--------|--------|
| `start` | Chạy server (local / khi không cần check). |
| `start:railway` | Check an toàn + start (**dùng trên Railway**). |
| `deploy:check` | Chỉ chạy `check-deploy-safe.mjs` (CI). |
| `backup:redis-state` | Xuất backup JSON state từ Redis. |

---

## 4. Thêm PostgreSQL sau này (gợi ý)

- Dùng plugin Postgres Railway, **`DATABASE_URL`**.
- Migration: chỉ **additive**; review bằng mắt trước khi merge.
- Chạy: `npx prisma migrate deploy` (hoặc tool tương đương) trong build/release — **không** `db push --force-reset`.

---

## 5. Tóm tắt

| Yêu cầu | Cách đáp ứng trong repo này |
|---------|---------------------------|
| Không reset DB production | Không có SQL DB; Redis là source of truth — tránh xóa plugin Redis / key. |
| Migration không phá | Không migration SQL; logic state additive trong `stateStore.mjs` (`migrateRows`). |
| Backup trước migrate | `npm run backup:redis-state` + backup Railway. |
| ENV cho kết nối | `REDIS_URL` (và tùy `DATABASE_URL` sau này). |
| Không seed ghi đè | Không seed lúc start; tùy chọn `TECSOPS_DISABLE_DEMO_SEED`; parse lỗi không reseed. |
| Prisma/Sequelize | Không dùng — nếu thêm, dùng migrate deploy / migration files, không force sync. |
| Safety check | `scripts/check-deploy-safe.mjs` trong `start:railway`. |
| Persistent storage | Redis plugin Railway (bền hơn filesystem container). |
