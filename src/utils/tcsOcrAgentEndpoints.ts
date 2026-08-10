import type { TcsPortalExtWarehouse } from "./tcsChromeExtension";

/** Port agent Playwright/OCR local theo kho. */
export function localAgentPortForWarehouse(
  warehouse: TcsPortalExtWarehouse
): 8765 | 8766 {
  return warehouse === "TCS" ? 8766 : 8765;
}

/**
 * Mirror logic `buildOcrAgentCandidates` trong background Ext.
 * Ưu tiên URL Ops (nếu có), rồi port đúng kho, rồi port kho kia.
 */
export function buildOcrAgentCandidates(
  warehouse: TcsPortalExtWarehouse,
  agentBaseUrl?: string | null
): string[] {
  const primary = localAgentPortForWarehouse(warehouse);
  const secondary = primary === 8766 ? 8765 : 8766;
  const candidates = [
    `http://127.0.0.1:${primary}`,
    `http://localhost:${primary}`,
    `http://127.0.0.1:${secondary}`,
    `http://localhost:${secondary}`,
  ];
  const explicit = String(agentBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (explicit) candidates.unshift(explicit);
  return [...new Set(candidates)];
}

/** URL OCR mặc định Ops truyền sang Ext khi ĐN. */
export function extensionOcrBaseUrl(
  warehouse: TcsPortalExtWarehouse
): string {
  return `http://127.0.0.1:${localAgentPortForWarehouse(warehouse)}`;
}
