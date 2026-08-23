/**
 * Policy portal TCS — chỉ Chrome Ext trên PC kho.
 * Agent Python / Railway Playwright / portal-worker đã gỡ (A3 + B1).
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

/** Mặc định auto = Ext PC. Ghi đè localStorage/env (agent/remote bị bỏ qua). */
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

/** Agent Python đã gỡ — luôn false. */
export function portalPolicyUsesAgent(
  _policy: PortalExecutorPolicy = getPortalExecutorPolicy()
): boolean {
  return false;
}

/**
 * Desktop: luôn khóa Ext.
 * Mobile: không khóa — UI báo «cần Ext trên PC».
 */
export function shouldLockToExtensionVisual(opts: {
  isMobile?: boolean;
  extensionOnline?: boolean;
  policy?: PortalExecutorPolicy;
}): boolean {
  void opts.extensionOnline;
  void opts.policy;
  return !opts.isMobile;
}

/** Thứ tự executor — chỉ Ext. Policy agent/remote legacy bị bỏ qua. */
export function resolvePortalExecutorOrder(
  action: PortalAction,
  opts: {
    policy?: PortalExecutorPolicy;
    preferRemote?: boolean;
    isMobile?: boolean;
    extensionOnline?: boolean;
  } = {}
): PortalExecutor[] {
  void action;
  void opts;
  return ["extension"];
}

export function portalExecutorLabel(ex: PortalExecutor): string {
  if (ex === "extension") return "Ext PC";
  if (ex === "agent") return "Agent (đã gỡ)";
  return "Máy kho từ xa (đã gỡ)";
}
