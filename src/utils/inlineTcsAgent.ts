/**
 * Railway / máy chủ all-in-one: Ops và agent cùng origin (/tcs-agent).
 * Phone nên gọi agent trực tiếp (không portal-worker PC) khi health OK.
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
 * true = phone/desktop nên dùng remote worker (PC kho).
 * false = có agent same-origin → đường nóng Railway/local.
 */
export function shouldPreferRemotePortal(
  isMobile: boolean,
  inlineAgentOk: boolean | null
): boolean {
  if (!isMobile) return false;
  // Chưa probe xong: tạm remote để không block; sau probe sẽ chỉnh lại.
  if (inlineAgentOk === null) return true;
  return !inlineAgentOk;
}
