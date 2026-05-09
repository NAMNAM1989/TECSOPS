import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { clampAirlineLabelOverrides } from "./airlineLabelOverridesCore";

const KEY = "tecsops-airline-label-overrides";

export function loadAirlineLabelOverridesFromStorage(): AirlineLabelOverrides | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return clampAirlineLabelOverrides(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveAirlineLabelOverridesToStorage(o: AirlineLabelOverrides): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(clampAirlineLabelOverrides(o)));
  } catch {
    /* ignore */
  }
}
