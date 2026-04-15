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
| **`ALLOW_FILE_STATE_ON_RAILWAY=1`** | Chỉ khi **cố ý** chạy không Redis (dễ mất dữ liệu mỗi deploy). Mặc định server **thoát** nếu phát hiện Railway mà không có `REDIS_URL`. |

**Không** lưu dữ liệu quan trọng chỉ trên filesystem container nếu không có Volume.

Trên **Railway**, nếu thiếu `REDIS_URL`, process sẽ **dừng ngay** (log `[FATAL] Railway: thiếu REDIS_URL`) để không chạy “tưởng ổn” rồi redeploy là mất hết.

---

## 2. Quy trình deploy an toàn

### Một lệnh (sau khi đã `git commit`)

```bash
npm run deploy:ship
```

Chạy kiểm tra `build` + `test` + `deploy:check`, backup Redis nếu có `REDIS_URL` (kể cả khi chỉ khai báo trong `.env` / `.env.local` — file này không commit), rồi `git push` (dừng nếu còn thay đổi chưa commit). Nếu push báo **Everything up-to-date**, script **tự kích hoạt deploy lại**: POST `RAILWAY_DEPLOY_HOOK_URL` (nếu có trong `.env`), hoặc **empty commit + push** (trừ khi `TECSOPS_NO_EMPTY_REDEPLOY=1`). Tùy chọn: đặt `TECSOPS_VERIFY_URL` trong `.env` để sau push gọi `GET …/api/health` xác nhận production còn sống.

**Quan trọng — vì sao push feature mà production không đổi:** Railway (mặc định GitHub) gần như luôn deploy từ nhánh **`main`**. Commit chỉ nằm trên `feature/...` thì **production không nhận** cho đến khi merge (hoặc fast-forward) vào `main` và `git push origin main`, **hoặc** bạn đổi trong Railway: Service → **Settings → Source → Branch** sang đúng nhánh feature.

Sau khi merge vào `main`, chạy `npm run deploy:ship` trên nhánh `main` (hoặc chỉ `git push origin main`) để trigger build.

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

---

## 6. Khôi phục khi mất dữ liệu (Redis trống / sai key / deploy nhầm)

1. **Ưu tiên file backup** từ `npm run backup:redis-state` (có trường `body`).
2. **Bản cục bộ dev** (nếu có): `.test-state/state.json` trong repo — có thể là snapshot cũ, **không chắc** trùng 100% production.
3. **Railway**: xem Redis plugin có **snapshot / backup** (nếu bật).

**Khôi phục vào Redis** (ghi đè key `tecsops:state`):

```powershell
$env:REDIS_URL = "<từ Railway Variables>"
npm run restore:redis-state -- .test-state/state.json
```

Hoặc file backup: `npm run restore:redis-state -- .\tecsops-state-2026-....json`

Kiểm tra trước: `node scripts/redis-restore-state.mjs --dry-run .\.test-state\state.json`

Sau khi SET, **restart** service trên Railway (hoặc đợi kết nối lại) và tải lại app.
