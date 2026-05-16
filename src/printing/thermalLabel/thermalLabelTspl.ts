import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import { shipmentToTsplBody } from "../../utils/shipmentToLabelPayload";
import type { ThermalLabelPrinterProfile } from "../printTypes";

export type TsplPrintResult = { ok: true } | { ok: false; error: string };

export async function fetchTsplRaw(
  body: Record<string, unknown>,
  mode: "build" | "print"
): Promise<{ ok: true; text?: string } | { ok: false; error: string }> {
  const path = mode === "print" ? "/api/tspl/print" : "/api/tspl/build";
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error ?? `HTTP ${res.status}` };
    }
    if (mode === "build") {
      return { ok: true, text: await res.text() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export function shipmentToTsplRequest(
  s: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null,
  opts?: { calibration?: boolean }
) {
  const base = shipmentToTsplBody(s, airlineLabelOverrides, profile);
  if (opts?.calibration) {
    return {
      ...base,
      calibration: true,
      profileName: profile.name,
      host: profile.host,
      port: profile.port ?? 9100,
    };
  }
  return {
    ...base,
    host: profile.host,
    port: profile.port ?? 9100,
  };
}

export async function printThermalLabelTspl(
  s: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): Promise<TsplPrintResult> {
  if (!profile.host?.trim()) {
    return { ok: false, error: "Chưa cấu hình IP máy in trong profile." };
  }
  const body = shipmentToTsplRequest(s, profile, airlineLabelOverrides);
  const out = await fetchTsplRaw(body, "print");
  return out.ok ? { ok: true } : { ok: false, error: out.error };
}

export async function printThermalCalibrationTspl(
  profile: ThermalLabelPrinterProfile
): Promise<TsplPrintResult> {
  if (!profile.host?.trim()) {
    return { ok: false, error: "Chưa cấu hình IP máy in trong profile." };
  }
  const body = {
    calibration: true,
    profileName: profile.name,
    widthMm: profile.labelWidthMm,
    heightMm: profile.labelHeightMm,
    gapMm: profile.gapMm,
    dpi: profile.dpi,
    offsetXmm: profile.offsetXmm,
    offsetYmm: profile.offsetYmm,
    host: profile.host,
    port: profile.port ?? 9100,
  };
  const out = await fetchTsplRaw(body, "print");
  return out.ok ? { ok: true } : { ok: false, error: out.error };
}

export async function downloadTsplFile(
  s: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): Promise<TsplPrintResult> {
  const body = shipmentToTsplRequest(s, profile, airlineLabelOverrides);
  const out = await fetchTsplRaw(body, "build");
  if (!out.ok) return { ok: false, error: out.error };
  const blob = new Blob([out.text ?? ""], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `label-${s.awb || "tem"}.tspl`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}
