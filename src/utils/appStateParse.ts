import type { Shipment } from "../types/shipment";
import type { AppState } from "./shipmentMutations";
import { parseCustomerDirectoryLoose } from "./customerDirectoryCore";
import { clampAirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { clampPrinterProfilesCatalog } from "../printing/printerProfilesCore";
import { normalizeEsidRegistrantStore } from "./esidRegistrantProfile";
import { normalizeEsidAgentStore } from "./esidAgentProfile";

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
  const esidRegistrantStore = normalizeEsidRegistrantStore(
    "esidRegistrantStore" in o ? o.esidRegistrantStore : undefined
  );
  const esidAgentStore = normalizeEsidAgentStore(
    "esidAgentStore" in o ? o.esidAgentStore : undefined
  );

  return {
    version: o.version,
    rows: o.rows as Shipment[],
    customers,
    airlineLabelOverrides,
    printerProfiles,
    esidRegistrantStore,
    esidAgentStore,
  };
}
