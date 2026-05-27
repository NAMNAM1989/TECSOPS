---
name: tecsops-railway-state-persistence
description: >-
  Giữ dữ liệu TECSOPS trên Railway: Postgres (DATABASE_URL) hoặc Redis (REDIS_URL) là nguồn sự thật,
  tránh seed lại / file container. Dùng khi deploy mất dữ liệu, cấu hình DATABASE_URL/REDIS_URL,
  backup/restore, hoặc debug sau railway up / GitHub deploy.
---

# TECSOPS — Không mất dữ liệu khi deploy Railway

## Kiến trúc (bắt buộc hiểu)

- **Postgres** (`DATABASE_URL`): nguồn chính cho app state JSONB + catalog in / weigh slips (khi bật).
- **Redis** (`REDIS_URL`): hàng đợi eCargo, Socket.IO adapter; có thể vẫn giữ bản state JSON (`tecsops:state`) khi chưa migrate hết sang Postgres.
- **Deploy / build image / `railway up` không tự xóa Postgres/Redis.** Nếu sau deploy UI “trống”, nguyên nhân gần như luôn là **URL DB sai / instance mới trống / hoặc đang dùng file trong container**.

Tham chiếu mã: `server/index.mjs` (`GET /api/health` báo `postgres` + `redis`), `server/stateStore.mjs`, `server/postgresStateStore.mjs`.

## Nguyên nhân hay gặp (theo thứ tự ưu tiên kiểm tra)

1. **Service app không có `REDIS_URL` trỏ đúng plugin Redis “sống lâu”**  
   Trên Railway: Redis (hoặc Valkey) phải là **service riêng**; service **web/app** phải có biến `REDIS_URL` (thường **Reference** tới biến `${{Redis.REDIS_URL}}` của đúng instance). Tạo lại Redis mới → URL mới → **database trống** → app seed state mới.

2. **`ALLOW_FILE_STATE_ON_RAILWAY=1`**  
   Cho phép chạy không Redis, dùng file dưới `DATA_DIR` / `server/data/state.json` **trên filesystem container** → **mỗi deploy là mất** (ổ đĩa ephemeral). **Không bật** trừ khi cố ý thử nghiệm.

3. **Đổi `REDIS_STATE_KEY` giữa các lần deploy**  
   Key cũ vẫn còn dữ liệu nhưng app đọc key mới → trống → seed mới vào key mới (trông như “mất hết”).

4. **Nhiều môi trường / nhiều project Railway**  
   `railway link` hoặc deploy nhầm branch/env → app trỏ Redis **khác** (trống hoặc dữ liệu cũ khác).

5. **Redis trống lần đầu và không có file migrate**  
   Logic: Redis `GET` rỗng → thử đọc `state.json` trên container (hiếm khi có) → không có → **`createInitialState()`** (demo từ `initialRows.json`) hoặc `{ rows: [] }` nếu `TECSOPS_DISABLE_DEMO_SEED=1` / `TECSOPS_EMPTY_INITIAL=1`. Đây không phải “xóa deploy” mà là **lần đầu ghi vào store trống**.

## Checklist trước khi deploy (agent / người vận hành)

- [ ] Railway → **service app** → Variables: có **`REDIS_URL`** (reference tới đúng Redis service production).
- [ ] **Không** có `ALLOW_FILE_STATE_ON_RAILWAY=1` trên production (trừ khi có Volume bền — hiện project không khuyến nghị).
- [ ] **Không** đổi `REDIS_STATE_KEY` nếu không có kế hoạch migrate.
- [ ] (Khuyến nghị) Backup: `npm run backup:redis-state` với `REDIS_URL` production (xem `docs/railway-safe-deploy.md`).

### Một lệnh sau khi đã commit

`npm run deploy:ship` — gom preflight + (tùy chọn) backup Redis nếu `REDIS_URL` có trong môi trường hoặc file `.env` / `.env.local` (script tự merge file, **không** commit secret) + `git push`. Dữ liệu đã nhập **không** mất miễn là Railway vẫn trỏ **cùng** Redis; lệnh không thể sửa cấu hình dashboard thay bạn.

## Kiểm tra sau deploy (nhanh)

- Gọi `GET /api/state` trên URL production: so sánh `version` và số phần tử `rows` với trước deploy (hoặc với backup JSON).
- Logs startup phải có dòng kiểu: `[redis] Socket.IO adapter + state storage (key tecsops:state)`.  
  Nếu thấy `[state] file local` trên Railway → **đang không dùng Redis** (chỉ xảy ra khi không phải Railway hoặc đã bật bypass file — rất nguy hiểm trên Railway).

## Khôi phục khi đã seed nhầm / Redis trống

1. File backup `npm run backup:redis-state` (hoặc snapshot Railway nếu có).
2. `npm run restore:redis-state -- <file.json>` với `REDIS_URL` đúng instance production.
3. Restart service app trên Railway.

## Mối quan hệ với deploy khác

- **Git push** (Railway auto-deploy) và **`railway up`** đều chỉ thay **code**; dữ liệu bền phụ thuộc **cùng một Redis + cùng biến môi trường**, không phụ thuộc cách upload build.
- Skill deploy tổng quát: `.cursor/skills/tecsops-github-railway/SKILL.md`.

## Khi user báo “mỗi lần deploy đều mất”

1. Xác nhận trên Railway Variables: `REDIS_URL` có tồn tại và **reference đúng service Redis không bị xóa tạo lại**.
2. Xác nhận không dùng file state trên Railway (`ALLOW_FILE_STATE_ON_RAILWAY`).
3. So sánh `/api/state` trước/sau; nếu `version` nhảy nhỏ và `rows` đổi số lượng đột ngột → có thể đã trỏ Redis trống hoặc key mới.
4. Khuyến nghị backup định kỳ và restore nếu cần.
