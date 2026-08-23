# TOOLS.md - Local Notes

## TCS / SCSC — Ext trên PC kho

- Đường chính: Ops (Railway hoặc local) → Chrome Ext TCS + SCSC trên PC.
- Docs: [docs/railway-online-portal.md](docs/railway-online-portal.md)
- Protocol: [docs/ops-ext-protocol.md](docs/ops-ext-protocol.md)
- Mã kho dữ liệu TECS-TCS dùng Ext TCS (không còn agent Railway / Python).
- Điện thoại: UI báo «cần Ext trên PC».

## Chrome Ext

- `chrome-extension-tcs/` (TCS ESID, cả mã kho TECS-TCS) · `chrome-extension-scsc/` (SCSC eCargo).
- Local: `npm run ext:fetch-ocr` rồi load unpacked / `npm run ext:package`.

## Railway follow-up (ops, không trong repo)

- Gỡ `TCS_AGENT_*` + volume `browser_profile` trên service Railway.

## Playwright MCP (Cursor)

- Chỉ QA/debug UI — [docs/playwright-mcp-ops-qa.md](docs/playwright-mcp-ops-qa.md).

## Related

- [Agent workspace](/concepts/agent-workspace)
