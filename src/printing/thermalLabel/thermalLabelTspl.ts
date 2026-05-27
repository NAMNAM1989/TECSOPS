import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import { shipmentToTsplBodyAsync } from "../../utils/shipmentToLabelPayload";
import type { ThermalLabelPrinterProfile } from "../printTypes";
import { printTsplViaLocalBridge } from "./thermalLocalBridge";

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

export async function shipmentToTsplRequest(
  s: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null,
  opts?: { calibration?: boolean }
) {
  const base = await shipmentToTsplBodyAsync(s, airlineLabelOverrides, profile);
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

/** In TSPL qua Print Bridge (Windows, tên hàng đợi USB). */
export async function printThermalLabelLocalBridge(
  s: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): Promise<TsplPrintResult> {
  const name = profile.windowsPrinterName?.trim();
  if (!name) return { ok: false, error: "Chưa cấu hình tên máy in Windows cho profile này." };
  const body = await shipmentToTsplRequest(s, profile, airlineLabelOverrides);
  const { host: _h, port: _p, ...fields } = body;
  const built = await fetchTsplRaw(fields, "build");
  if (!built.ok) return built;
  const tspl = built.text ?? "";
  if (!tspl.trim()) return { ok: false, error: "TSPL trống." };
  return printTsplViaLocalBridge(name, tspl);
}

export async function printThermalLabelTspl(
  s: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): Promise<TsplPrintResult> {
  if (!profile.host?.trim()) {
    return { ok: false, error: "Chưa cấu hình IP máy in trong profile." };
  }
  const body = await shipmentToTsplRequest(s, profile, airlineLabelOverrides);
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
  const body = await shipmentToTsplRequest(s, profile, airlineLabelOverrides);
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
