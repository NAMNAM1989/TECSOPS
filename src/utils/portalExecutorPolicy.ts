/**
 * Policy chọn đường portal TCS — chỉ Chrome Ext trên PC kho.
 *
 * Agent Python / Railway Playwright đã gỡ (A3). `agent-only` / `remote-only`
 * còn đọc được từ localStorage cũ nhưng luôn rơi về Ext.
 */

export type PortalExecutorPolicy =
  | "auto"
  | "ext-only"
  | "agent-only"
  | "remote-only";

export type PortalAction = "login" | "scan" | "fill" | "pdf";

export type PortalExecutor = "extension" | "agent" | "remote";

const LS_KEY = "tecsops-portal-executor-policy";
const VISUAL_LS_KEY = "tecsops-portal-visual-control";

function normalizePolicy(raw: string | undefined | null): PortalExecutorPolicy | null {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (t === "auto" || t === "ext-only" || t === "agent-only" || t === "remote-only") {
    return t;
  }
  return null;
}

/** Mặc định auto = Ext PC. Ghi đè: VITE_ / localStorage (agent/remote bị bỏ qua). */
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
 * Chế độ trực quan = App-click → tab Chrome Ext trên PC kho.
 * Mặc định bật. Không còn fallback agent khi tắt.
 */
export function getPortalVisualControl(): boolean {
  try {
    const v = String(localStorage.getItem(VISUAL_LS_KEY) || "")
      .trim()
      .toLowerCase();
    if (v === "0" || v === "false" || v === "off") return false;
    if (v === "1" || v === "true" || v === "on") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function setPortalVisualControl(on: boolean): void {
  try {
    localStorage.setItem(VISUAL_LS_KEY, on ? "1" : "0");
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
 * Desktop: luôn khóa Ext (không còn agent Railway).
 * Mobile: không khóa — UI báo «cần Ext trên PC».
 */
export function shouldLockToExtensionVisual(opts: {
  isMobile?: boolean;
  visualControl?: boolean;
  extensionOnline?: boolean;
  policy?: PortalExecutorPolicy;
}): boolean {
  void opts.visualControl;
  void opts.extensionOnline;
  void opts.policy;
  return !opts.isMobile;
}

/**
 * Thứ tự executor — chỉ Ext. Policy agent/remote legacy bị bỏ qua.
 */
export function resolvePortalExecutorOrder(
  action: PortalAction,
  opts: {
    policy?: PortalExecutorPolicy;
    preferRemote?: boolean;
    isMobile?: boolean;
    visualControl?: boolean;
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
