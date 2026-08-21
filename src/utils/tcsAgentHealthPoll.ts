/** Poll /tcs-agent/health chỉ khi đang dùng TCS — idle 2 phút thì dừng. */

export const TCS_AGENT_HEALTH_POLL_MS = 15_000;
export const TCS_AGENT_HEALTH_IDLE_MS = 120_000;

const STOP_ERRORS = new Set(["AGENT_OFF", "AGENT_OFFLINE"]);

export function isTcsAgentHealthStopError(error?: string | null): boolean {
  return STOP_ERRORS.has(String(error || "").trim().toUpperCase());
}

export function shouldPollTcsAgentHealth(opts: {
  toolbarActive: boolean;
  watching: boolean;
  sessionOpen: boolean;
  lastActivityAt: number | null;
  healthError?: string | null;
  now?: number;
}): boolean {
  if (!opts.toolbarActive) return false;
  if (isTcsAgentHealthStopError(opts.healthError)) return false;
  if (opts.sessionOpen) return true;
  if (!opts.watching) return false;
  if (opts.lastActivityAt == null) return false;
  const now = opts.now ?? Date.now();
  return now - opts.lastActivityAt < TCS_AGENT_HEALTH_IDLE_MS;
}
