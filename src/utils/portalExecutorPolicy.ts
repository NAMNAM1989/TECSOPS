/**
 * Policy chọn đường portal TCS — mô hình App-click → Ext trên PC kho.
 *
 * Mặc định auto + «Trực quan» (bật):
 * - Desktop: chỉ Chrome Ext (`chrome-extension-tcs` / SCSC) thực thi — không Playwright Railway.
 * - Ext offline → UI báo cài Ext; không lặng lẽ sang agent headless.
 * - Mobile: agent-only (phone không có Ext) — đường phụ.
 *
 * Tắt «Trực quan» hoặc policy `agent-only` → mới dùng Railway `TCS_AGENT_*` / browser_profile.
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

/** Mặc định auto (desktop Ext-first; mobile agent phụ). Ghi đè: VITE_ / localStorage. */
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
 * Mặc định bật. Tắt chỉ khi cố ý dùng agent Railway headless (fallback).
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

/** Policy có dùng Playwright agent (Railway/local) không — đường phụ. */
export function portalPolicyUsesAgent(
  policy: PortalExecutorPolicy = getPortalExecutorPolicy()
): boolean {
  return policy === "auto" || policy === "agent-only";
}

/**
 * Desktop + Trực quan (mặc định): khóa chỉ Ext — kể cả khi Ext offline
 * (UI hiện chip «Ext · offline», không fallback Playwright Railway).
 */
export function shouldLockToExtensionVisual(opts: {
  isMobile?: boolean;
  visualControl?: boolean;
  /** Giữ tham số tương thích; không còn điều kiện khóa. */
  extensionOnline?: boolean;
  policy?: PortalExecutorPolicy;
}): boolean {
  void opts.extensionOnline;
  if (opts.isMobile) return false;
  const policy = opts.policy || getPortalExecutorPolicy();
  if (policy === "agent-only" || policy === "remote-only") return false;
  if (policy === "ext-only") return true;
  const visual =
    opts.visualControl === undefined
      ? getPortalVisualControl()
      : opts.visualControl;
  return Boolean(visual);
}

/**
 * Thứ tự thử executor — App-click → PC Ext là đường chính.
 * - auto + desktop + Trực quan: chỉ Ext
 * - auto + desktop + tắt Trực quan: Ext → agent (fallback có chủ đích)
 * - auto + mobile: chỉ agent (phone)
 * - ext-only / agent-only / remote-only: như tên
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
  if (ex === "extension") return "Ext PC";
  if (ex === "agent") return "Agent Railway (fallback)";
  return "Máy kho từ xa (deprecated)";
}
