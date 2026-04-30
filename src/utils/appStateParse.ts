import type { Shipment } from "../types/shipment";
import type { AppState } from "./shipmentMutations";
import { parseCustomerDirectoryLoose } from "./customerDirectoryCore";

export function parseAppState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== "number" || !Array.isArray(o.rows)) return null;
  const customersUnknown = "customers" in o ? o.customers : undefined;
  const customers = parseCustomerDirectoryLoose(customersUnknown);
  return {
    version: o.version,
    rows: o.rows as Shipment[],
    customers,
  };
}
