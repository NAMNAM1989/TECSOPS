/**
 * Probe agent nội bộ (legacy). Vận hành mặc định chỉ Chrome Ext —
 * không ưu tiên remote máy kho / portal-worker.
 */
import { pingTcsAgent } from "./tcsPortalAgentApi";
import type { TcsPortalWarehouse } from "./tcsPortalJob";

export type InlineAgentProbe = {
  ok: boolean;
  loggedIn: boolean;
  warehouse: TcsPortalWarehouse;
};

/** Probe nhanh agent nội bộ theo kho (header X-Portal-Warehouse). */
export async function probeInlineTcsAgent(
  warehouse: TcsPortalWarehouse,
  timeoutMs = 2500
): Promise<InlineAgentProbe> {
  const h = await pingTcsAgent(timeoutMs, { warehouse });
  return {
    ok: Boolean(h?.ok),
    loggedIn: Boolean(h?.session?.logged_in),
    warehouse,
  };
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
