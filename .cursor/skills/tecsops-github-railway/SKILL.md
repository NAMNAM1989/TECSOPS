---
name: tecsops-github-railway
description: >-
  Pushes TECSOPS changes to GitHub and deploys to Railway without losing Postgres state.
  Use when the user asks to deploy, push to GitHub, release to Railway, or ship the app.
---

# TECSOPS — GitHub & Railway

Stack: React/Vite + Express; **state = Postgres** (`DATABASE_URL`), key `tecsops:state` trong bảng `app_state`.

## Before push / deploy

- Production data lives in **Postgres**, not container disk. Keep **`DATABASE_URL`** stable.
- Optional: `npm run backup:postgres-state`
- `npm run deploy:check` blocks destructive patterns.

## One-command deploy

```bash
npm run deploy:ship
```

= `deploy:safe` (build + test + deploy:check + backup Postgres nếu có `DATABASE_URL`) → `git push` → redeploy hook/empty commit nếu up-to-date → optional health poll.

## After deploy

- `/api/health` → `{ ok: true, storage: { postgres: true } }`
- Empty UI: verify `DATABASE_URL` still points at the same Postgres.

## Restore

- `npm run restore:postgres-state -- <path-to-json>`

## Do not

- Commit secrets. Add destructive DB reset strings to start scripts.
