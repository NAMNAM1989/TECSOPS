/**
 * Policy chọn đường portal TCS — đồng loạt TECS-TCS & TCS.
 * Mặc định auto:
 * - Desktop: Ext → agent (nhìn được trên PC có Ext)
 * - Mobile: agent-only cho Quét/PDF (không gọi Ext)
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

/** Mặc định auto (desktop Ext→agent; mobile agent-only). Ghi đè: VITE_ / localStorage. */
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
 * - auto + desktop: Ext → agent
 * - auto + mobile: chỉ agent (Quét/PDF trên phone)
 * - ext-only / agent-only / remote-only: như tên
 * - preferRemote: deprecated — bỏ qua
 */
export function resolvePortalExecutorOrder(
  action: PortalAction,
  opts: {
    policy?: PortalExecutorPolicy;
    preferRemote?: boolean;
    /** Viewport ≤767 — phone: agent-only khi auto */
    isMobile?: boolean;
  } = {}
): PortalExecutor[] {
  void action;
  void opts.preferRemote;
  const policy = opts.policy || getPortalExecutorPolicy();

  if (policy === "agent-only") return ["agent"];
  if (policy === "remote-only") return ["remote"];
  if (policy === "ext-only") return ["extension"];
  // auto
  if (opts.isMobile) return ["agent"];
  return ["extension", "agent"];
}

export function portalExecutorLabel(ex: PortalExecutor): string {
  if (ex === "extension") return "Ext";
  if (ex === "agent") return "Agent cloud";
  return "Máy kho từ xa (deprecated)";
}
