/**
 * A3 — Agent Python/Playwright đã gỡ.
 * Stub `/tcs-agent/*` trả 410 để client cũ không dính 500 / SPA fallback HTML.
 */
export function isTcsAgentProxyEnabled() {
  return false;
}

export function isTcsAgentProcessEnabled() {
  return false;
}

export function resolveTcsAgentTarget(_warehouse) {
  return "";
}

export function registerTcsAgentProxy(app) {
  console.info(
    "[tcs-agent] đã gỡ (A3) — /tcs-agent trả 410. Dùng Chrome Ext TCS/SCSC trên PC."
  );
  app.use("/tcs-agent", (_req, res) => {
    res.status(410).json({
      ok: false,
      error: "AGENT_GONE",
      message:
        "Agent Python/Playwright đã gỡ. Đăng Nhập TCS / Quét / Điền / PDF chỉ qua Chrome Ext trên PC (TCS + SCSC).",
    });
  });
}
