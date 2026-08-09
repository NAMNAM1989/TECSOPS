/**
 * Policy chọn đường portal TCS — đồng loạt TECS-TCS & TCS.
 * Mặc định: auto = Ext (nhanh) → agent local → remote worker.
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

/** Mặc định auto. Có thể ghi đè bằng VITE_PORTAL_EXECUTOR_POLICY hoặc localStorage. */
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

/**
 * Thứ tự thử executor cho một thao tác.
 * - auto + desktop: Ext → agent → remote (PDF: agent → Ext → remote)
 * - preferRemote (phone): remote trước, rồi Ext/agent nếu còn
 */
export function resolvePortalExecutorOrder(
  action: PortalAction,
  opts: {
    policy?: PortalExecutorPolicy;
    preferRemote?: boolean;
  } = {}
): PortalExecutor[] {
  const policy = opts.policy || getPortalExecutorPolicy();

  if (policy === "ext-only") return ["extension"];
  if (policy === "agent-only") return ["agent"];
  if (policy === "remote-only") return ["remote"];

  // auto
  if (opts.preferRemote) {
    // Phone ngoài WiFi / không có agent nội bộ: worker trước
    return ["remote", "agent", "extension"];
  }

  if (action === "pdf") {
    // Railway/local agent: cache/prefetch → gần tức thời
    return ["agent", "extension", "remote"];
  }

  // login / scan / fill — Ext desktop nhanh; phone không Ext → agent
  return ["extension", "agent", "remote"];
}

export function portalExecutorLabel(ex: PortalExecutor): string {
  if (ex === "extension") return "Ext";
  if (ex === "agent") return "Agent";
  return "Máy kho từ xa";
}
