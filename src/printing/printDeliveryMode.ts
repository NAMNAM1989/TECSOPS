const KEY = "tecsops-thermal-delivery-mode";

export type ThermalDeliveryMode = "tspl-tcp" | "browser-print";

export function loadThermalDeliveryMode(): ThermalDeliveryMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "tspl-tcp" || v === "browser-print") return v;
  } catch {
    /* ignore */
  }
  return "browser-print";
}

/** TSPL chỉ khi user chọn và profile có IP — tránh in “không ra gì”. */
export function resolveEffectiveThermalDeliveryMode(
  mode: ThermalDeliveryMode,
  profileHost?: string | null
): ThermalDeliveryMode {
  if (mode === "tspl-tcp" && profileHost?.trim()) return "tspl-tcp";
  return "browser-print";
}

export function saveThermalDeliveryMode(mode: ThermalDeliveryMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
