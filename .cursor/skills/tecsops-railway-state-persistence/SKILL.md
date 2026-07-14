---
name: tecsops-railway-state-persistence
description: >-
  Giữ dữ liệu TECSOPS trên Railway: Postgres (DATABASE_URL) là nguồn sự thật,
  tránh seed lại / file container. Dùng khi deploy mất dữ liệu, cấu hình DATABASE_URL,
  backup/restore, hoặc debug sau railway up / GitHub deploy.
---

# TECSOPS — Postgres state persistence

## Nguồn sự thật

- **Postgres** (`DATABASE_URL`): bảng `app_state`, key `POSTGRES_STATE_KEY` (mặc định `tecsops:state`).
- Socket.IO in-memory → **1 replica** khuyến nghị.
- Không Redis, không file container, không demo seed.

## Checklist khi “mất dữ liệu”

1. Railway → service app → Variables: **`DATABASE_URL`** còn và trỏ đúng instance Postgres.
2. Không đổi `POSTGRES_STATE_KEY` giữa các lần deploy nếu không có kế hoạch migrate.
3. Backup: `npm run backup:postgres-state`
4. Restore: `npm run restore:postgres-state -- <file.json>`

## Deploy an toàn

`npm run deploy:ship` — preflight + backup Postgres (nếu `DATABASE_URL` có trong env) + push.

Xem thêm: `docs/railway-safe-deploy.md`.
