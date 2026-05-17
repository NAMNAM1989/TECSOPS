import type { Shipment } from "../types/shipment";
import type { AppState } from "./shipmentMutations";
import { parseCustomerDirectoryLoose } from "./customerDirectoryCore";
import { clampAirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { clampPrinterProfilesCatalog } from "../printing/printerProfilesCore";
import { clampGlobalAgentCatalog, defaultGlobalAgentCatalog } from "./globalAgentsCore";
import { clampScscWeighPrintSettings } from "../printing/scscWeigh/scscWeighPrintSettingsCore";

export function parseAppState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== "number" || !Array.isArray(o.rows)) return null;
  const customersUnknown = "customers" in o ? o.customers : undefined;
  const customers = parseCustomerDirectoryLoose(customersUnknown);
  const airlineLabelOverrides = clampAirlineLabelOverrides(
    "airlineLabelOverrides" in o ? o.airlineLabelOverrides : undefined
  );
  const printerProfiles = clampPrinterProfilesCatalog(
    "printerProfiles" in o ? o.printerProfiles : undefined
  );
  const globalAgents = clampGlobalAgentCatalog(
    "globalAgents" in o ? o.globalAgents : defaultGlobalAgentCatalog()
  );
  const scscWeighPrintSettings = clampScscWeighPrintSettings(
    "scscWeighPrintSettings" in o ? o.scscWeighPrintSettings : undefined
  );

  return {
    version: o.version,
    rows: o.rows as Shipment[],
    customers,
    globalAgents,
    airlineLabelOverrides,
    printerProfiles,
    scscWeighPrintSettings,
  };
}
