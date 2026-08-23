# TOOLS.md - Local Notes

## TCS — vận hành online (Railway Playwright)

- Đường chính: Ops trên Railway → `/tcs-agent` → Playwright headless (không máy kho).
- Docs: [docs/railway-online-portal.md](docs/railway-online-portal.md)
- Policy mặc định `auto` = agent cloud → Ext (tuỳ chọn desktop).
- Variables: `TCS_USERNAME` / `TCS_PASSWORD` + `TCS_USERNAME_TCS` / `TCS_PASSWORD_TCS` + `TCS_AGENT_DUAL=1`.
- Volume: `browser_profile_hub` + `browser_profile_tcs` để giữ session.

## Chrome Ext (tuỳ chọn desktop)

- `chrome-extension-tcs/` (TCS ESID) · `chrome-extension-scsc/` (SCSC eCargo).
- Protocol: [docs/ops-ext-protocol.md](docs/ops-ext-protocol.md).
- Dùng khi muốn thao tác trên Chrome local; không bắt buộc khi online Railway.

## Local agent (dev)

- `npm run tcs:agent:real` hoặc `portal:start:both`.
- `VITE_PORTAL_EXECUTOR_POLICY=ext-only` nếu chỉ test Ext.

## Playwright MCP (Cursor)

- Chỉ QA/debug UI — [docs/playwright-mcp-ops-qa.md](docs/playwright-mcp-ops-qa.md).

## Related

- [Agent workspace](/concepts/agent-workspace)
