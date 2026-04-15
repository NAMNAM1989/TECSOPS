---
name: tecsops-github-railway
description: >-
  Pushes TECSOPS changes to GitHub and deploys to Railway without losing Redis state.
  Use when the user asks to deploy, push to GitHub, release to Railway, or ship the app.
---

# TECSOPS — GitHub & Railway

Stack: React/Vite + Express; **state = Redis** (`REDIS_URL`), key `tecsops:state`. No Prisma/SQL in app.

## Before push / deploy

- **Production data** lives in **Redis**, not container disk. Service must keep **`REDIS_URL`** stable across deploys.
- Optional safety: `npm run backup:redis-state` (needs `REDIS_URL` in env).
- Run `npm run build` before trusting deploy; `npm run deploy:check` runs the destructive-pattern gate.

## GitHub

1. `git status` — only stage files meant for the request.
2. `git add …` then `git commit -m "…"` (short, imperative; Vietnamese OK if team uses it).
3. `git push origin <branch>` (e.g. `feature/daily-boards-unique-awb-booking-edit`).

If Railway is connected to the repo, **push alone** may trigger deploy — no extra step.

## Một lệnh deploy an toàn (Git push → Railway build từ repo)

Từ root repo, sau khi đã **commit** mọi thay đổi:

```bash
npm run deploy:ship
```

Chạy: `deploy:safe` (build + test + deploy:check + backup Redis nếu có `REDIS_URL`) → `git push` → tùy chọn gọi `GET /api/health` nếu set `TECSOPS_VERIFY_URL` trong `.env` (xem `.env.example`). Nếu còn file chưa commit, lệnh **dừng** trước khi push.

## Railway CLI deploy

When the user wants explicit CLI deploy (không qua Git):

1. `railway login` (interactive) if needed; `railway link` to the right project/service once.
2. From repo root: `npm run build` then `railway up`.
   Or rely on `railway.toml`: `startCommand` = `npm run start:railway` (safe check + `node server/index.mjs`).

Non-interactive/CI: set **`RAILWAY_TOKEN`** then `railway up`.

## After deploy

- Confirm app URL loads; hit **`/api/health`** → 200.
- If UI looks empty: verify **`REDIS_URL`** on the app service still points at the **same** Redis instance.

Chi tiết nguyên nhân “mất dữ liệu mỗi deploy” và checklist Redis: skill **`tecsops-railway-state-persistence`** (`.cursor/skills/tecsops-railway-state-persistence/SKILL.md`).

## Restore (only if Redis empty / wrong)

- `npm run restore:redis-state -- <path-to-json>` with `REDIS_URL` set. See `docs/railway-safe-deploy.md`.

## Do not

- Add destructive DB strings to `package.json` / `railway.toml` (deploy check blocks common ones).
- Commit secrets (tokens, full `REDIS_URL` in docs — use placeholders).
