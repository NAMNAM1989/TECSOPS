/**
 * Probe agent nội bộ — đã gỡ (A3). Giữ chữ ký để không phá test / import cũ.
 */
import type { TcsPortalWarehouse } from "./tcsPortalJob";

export type InlineAgentProbe = {
  ok: boolean;
  loggedIn: boolean;
  warehouse: TcsPortalWarehouse;
};

/** Agent Python đã gỡ — luôn offline. */
export async function probeInlineTcsAgent(
  warehouse: TcsPortalWarehouse,
  _timeoutMs = 2500
): Promise<InlineAgentProbe> {
  return { ok: false, loggedIn: false, warehouse };
}

/**
 * Luôn false — đã bỏ portal-worker / máy kho từ xa.
 * Giữ chữ ký để không phá call site (AirCargoTracking).
 */
export function shouldPreferRemotePortal(
  _isMobile: boolean,
  _inlineAgentOk: boolean | null
): boolean {
  return false;
}
