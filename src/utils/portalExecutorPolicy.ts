/**
 * Policy chọn đường portal TCS — đồng loạt TECS-TCS & TCS.
 * Mặc định auto:
 * - Desktop: Ext → agent (nhìn được trên PC có Ext)
 * - Mobile: agent-only cho Quét/PDF (không gọi Ext)
 * Không còn máy kho / portal-worker.
 *
 * Chế độ trực quan (`tecsops-portal-visual-control`):
 * - Bật + desktop + Ext online → chỉ Ext (không fallback headless ẩn).
 * - Tắt → giữ auto Ext→agent.
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

/**
 * Chế độ trực quan: khi có Ext trên desktop, không chạy agent headless ẩn.
 * Mặc định bật — máy kiểm soát thấy tab TCS. Tắt nếu muốn fallback cloud.
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

/** Policy có dùng Playwright agent (Railway/local) không. */
export function portalPolicyUsesAgent(
  policy: PortalExecutorPolicy = getPortalExecutorPolicy()
): boolean {
  return policy === "auto" || policy === "agent-only";
}

/**
 * Khi bật trực quan + desktop + Ext đã ping được → chỉ đi Ext.
 * (Ext cài rồi nhưng chưa ĐN vẫn không được lặng lẽ sang headless.)
 */
export function shouldLockToExtensionVisual(opts: {
  isMobile?: boolean;
  visualControl?: boolean;
  extensionOnline?: boolean;
  policy?: PortalExecutorPolicy;
}): boolean {
  if (opts.isMobile) return false;
  const policy = opts.policy || getPortalExecutorPolicy();
  if (policy === "agent-only" || policy === "remote-only") return false;
  if (policy === "ext-only") return true;
  const visual =
    opts.visualControl === undefined
      ? getPortalVisualControl()
      : opts.visualControl;
  return Boolean(visual && opts.extensionOnline);
}

/**
 * Thứ tự thử executor.
 * - auto + desktop: Ext → agent
 * - auto + mobile: chỉ agent (Quét/PDF trên phone)
 * - ext-only / agent-only / remote-only: như tên
 * - visualControl + extensionOnline + desktop: chỉ Ext
 * - preferRemote: deprecated — bỏ qua
 */
export function resolvePortalExecutorOrder(
  action: PortalAction,
  opts: {
    policy?: PortalExecutorPolicy;
    preferRemote?: boolean;
    /** Viewport ≤767 — phone: agent-only khi auto */
    isMobile?: boolean;
    /** Chế độ trực quan (mặc định đọc localStorage) */
    visualControl?: boolean;
    /** Ext đã ping ok trên máy này */
    extensionOnline?: boolean;
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
  if (
    shouldLockToExtensionVisual({
      isMobile: false,
      visualControl: opts.visualControl,
      extensionOnline: opts.extensionOnline,
      policy,
    })
  ) {
    return ["extension"];
  }
  return ["extension", "agent"];
}

export function portalExecutorLabel(ex: PortalExecutor): string {
  if (ex === "extension") return "Ext";
  if (ex === "agent") return "Agent cloud";
  return "Máy kho từ xa (deprecated)";
}
