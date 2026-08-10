/**
 * portal:worker / portal:start:warehouse đã deprecate.
 * Vận hành ngày: Chrome Ext. Test: Playwright MCP (docs/playwright-mcp-ops-qa.md).
 */
const kind = String(process.argv[2] || "").trim();
const label =
  kind === "warehouse"
    ? "portal:start:warehouse"
    : kind === "worker"
      ? "portal:worker"
      : "portal remote";

console.error(`[DEPRECATED] ${label} đã bỏ — không còn máy kho / portal-worker cho vận hành ngày.`);
console.error("  → Dùng Chrome Ext (TECS-TCS / TCS) trên desktop.");
console.error("  → Test/debug: Playwright MCP trong Cursor — xem docs/playwright-mcp-ops-qa.md");
console.error("  → Khẩn cấp legacy: npm run portal:worker:legacy / portal:start:warehouse:legacy");
process.exit(1);
