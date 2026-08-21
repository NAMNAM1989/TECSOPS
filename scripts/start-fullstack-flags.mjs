/**
 * Cờ spawn agent cho Railway/Docker — tách để unit test.
 * Dual chỉ khi TCS_AGENT_DUAL explicit 1/true/on (không suy từ user/pass).
 */

export function explicitFlagOn(raw) {
  const t = String(raw ?? "").trim().toLowerCase();
  return t === "1" || t === "true" || t === "on";
}

/** Trống → defaultOn. Chỉ 0/false/off/no là tắt. */
export function envFlagOn(raw, defaultOn = false) {
  if (raw == null || String(raw).trim() === "") return defaultOn;
  const t = String(raw).trim().toLowerCase();
  return t !== "0" && t !== "false" && t !== "off" && t !== "no";
}

export function dualAgentEnabled(env = process.env) {
  return explicitFlagOn(env.TCS_AGENT_DUAL);
}

/** Mặc định bật HTTP agent (không Chromium). 0 = không spawn Python. */
export function agentProcessEnabled(env = process.env) {
  return envFlagOn(env.TCS_AGENT_ENABLED, true);
}

/** Trống → "0" — cấm fallback "1". */
export function resolveAutoOpen(env = process.env) {
  const raw = env.TCS_AUTO_OPEN;
  if (raw == null || String(raw).trim() === "") return "0";
  return String(raw).trim();
}
