/**
 * Log gỡ lỗi có kiểm soát:
 * - Mặc định bật khi `import.meta.env.DEV`
 * - Production: chỉ khi người dùng set `localStorage.setItem("TECSOPS_DEBUG", "1")` rồi F5
 * - `debugError` luôn ghi `console.error` (hỗ trợ QA / báo lỗi thật)
 */
function isVerboseDebug(): boolean {
  try {
    if (import.meta.env.DEV) return true;
    return typeof window !== "undefined" && window.localStorage?.getItem("TECSOPS_DEBUG") === "1";
  } catch {
    return Boolean(import.meta.env.DEV);
  }
}

export function debugWarn(scope: string, ...args: unknown[]): void {
  if (isVerboseDebug()) console.warn(`[TECSOPS][${scope}]`, ...args);
}

export function debugError(scope: string, ...args: unknown[]): void {
  console.error(`[TECSOPS][${scope}]`, ...args);
}
