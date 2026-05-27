const KEY = "tecsops-thermal-delivery-mode";

export type ThermalDeliveryMode = "tspl-tcp" | "browser-print" | "local-bridge";

export function loadThermalDeliveryMode(): ThermalDeliveryMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "tspl-tcp" || v === "browser-print" || v === "local-bridge") return v;
  } catch {
    /* ignore */
  }
  return "local-bridge";
}

/** Ưu tiên bridge USB (tên máy Windows) → TSPL mạng (IP) → in qua trình duyệt. */
export function resolveEffectiveThermalDeliveryMode(
  mode: ThermalDeliveryMode,
  profile: { host?: string | null; windowsPrinterName?: string | null },
  bridgeOnline = false
): ThermalDeliveryMode {
  const win = profile.windowsPrinterName?.trim();
  if (bridgeOnline && win) return "local-bridge";
  if (mode === "local-bridge" && win) {
    return bridgeOnline ? "local-bridge" : "browser-print";
  }
  if (mode === "tspl-tcp" && profile.host?.trim()) return "tspl-tcp";
  return "browser-print";
}

export function saveThermalDeliveryMode(mode: ThermalDeliveryMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
