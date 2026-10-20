# TOOLS.md - Local Notes

## Railway follow-up (ops, không trong repo)

- Có thể gỡ `TCS_AGENT_*`, `ECARGO_IMAP_*` + volume `browser_profile` trên service Railway nếu còn sót.

### Gỡ Redis (nếu còn sót trên Railway)

App **không** đọc Redis. Chỉ cần xóa service/biến trên dashboard:

1. Railway → project **chic-nurturing** → kiểm tra còn service tên Redis / Redis-URL không.
2. Service **app** → Variables: xóa `REDIS_URL`, `REDISHOST`, `REDISPORT`, `REDISPASSWORD`, `REDISUSER`, `REDIS_STATE_KEY` (nếu có).
3. Nếu app có Reference Variable trỏ Redis → gỡ reference trước.
4. Xóa service Redis (⋯ → Delete) — **không** đụng Postgres.
5. Redeploy app; xác nhận `GET /api/health` → `storage.postgres: true`.

## Playwright MCP (Cursor)

- Chỉ QA/debug UI — [docs/playwright-mcp-ops-qa.md](docs/playwright-mcp-ops-qa.md).

## Related

- [Agent workspace](/concepts/agent-workspace)
