/**
 * Policy chọn đường portal TCS — đồng loạt TECS-TCS & TCS.
 * Mặc định online: auto = Playwright agent (Railway /tcs-agent) rồi mới Chrome Ext.
 * Không còn máy kho / portal-worker.
 */

export type PortalExecutorPolicy =
  | "auto"
  | "ext-only"
  | "agent-only"
  | "remote-only";

export type PortalAction = "login" | "scan" | "fill" | "pdf";

export type PortalExecutor = "extension" | "agent" | "remote";

const LS_KEY = "tecsops-portal-executor-policy";

function normalizePolicy(raw: string | undefined | null): PortalExecutorPolicy | null {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (t === "auto" || t === "ext-only" || t === "agent-only" || t === "remote-only") {
    return t;
  }
  return null;
}

/** Mặc định auto (= agent → Ext). Ghi đè: VITE_PORTAL_EXECUTOR_POLICY hoặc localStorage. */
export function getPortalExecutorPolicy(): PortalExecutorPolicy {
  try {
    const fromLs = normalizePolicy(localStorage.getItem(LS_KEY));
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  try {
    const fromEnv = normalizePolicy(
      String(import.meta.env.VITE_PORTAL_EXECUTOR_POLICY || "")
    );
    if (fromEnv) return fromEnv;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function setPortalExecutorPolicy(policy: PortalExecutorPolicy | ""): void {
  try {
    if (!policy || policy === "auto") {
      localStorage.removeItem(LS_KEY);
      return;
    }
    localStorage.setItem(LS_KEY, policy);
  } catch {
    /* ignore */
  }
}

/** Policy có dùng Playwright agent (Railway/local) không. */
export function portalPolicyUsesAgent(
  policy: PortalExecutorPolicy = getPortalExecutorPolicy()
): boolean {
  return policy === "auto" || policy === "agent-only";
}

/**
 * Thứ tự thử executor.
 * - auto: agent (Railway online) → Ext (desktop tuỳ chọn)
 * - ext-only: chỉ Chrome Ext
 * - agent-only: chỉ agent
 * - remote-only: deprecated — Ops không gọi
 * - preferRemote: bỏ qua
 */
export function resolvePortalExecutorOrder(
  action: PortalAction,
  opts: {
    policy?: PortalExecutorPolicy;
    preferRemote?: boolean;
  } = {}
): PortalExecutor[] {
  void action;
  void opts.preferRemote;
  const policy = opts.policy || getPortalExecutorPolicy();

  if (policy === "agent-only") return ["agent"];
  if (policy === "remote-only") return ["remote"];
  if (policy === "ext-only") return ["extension"];
  // auto — online-first
  return ["agent", "extension"];
}

export function portalExecutorLabel(ex: PortalExecutor): string {
  if (ex === "extension") return "Ext";
  if (ex === "agent") return "Agent cloud";
  return "Máy kho từ xa (deprecated)";
}
