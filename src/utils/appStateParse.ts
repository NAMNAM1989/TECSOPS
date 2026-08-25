import type { Shipment } from "../types/shipment";
import type { AppState } from "./shipmentMutations";
import { parseCustomerDirectoryLoose } from "./customerDirectoryCore";
import { clampAirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { clampPrinterProfilesCatalog } from "../printing/printerProfilesCore";
import { normalizeEsidRegistrantStore } from "./esidRegistrantProfile";
import { normalizeEsidAgentStore } from "./esidAgentProfile";
import { normalizeEcargoScscStore } from "./ecargoScscProfile";
import { toSyncedAtIso } from "./dbSyncedAt";

function parseSyncMeta(raw: unknown): AppState["syncMeta"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const byWh =
    o.lotsMaxSyncedAtByWarehouse && typeof o.lotsMaxSyncedAtByWarehouse === "object"
      ? (o.lotsMaxSyncedAtByWarehouse as Record<string, string | null>)
      : {};
  return {
    source:
      o.source === "namnamlogistics-rest" ||
      o.source === "postgres-lots" ||
      o.source === "state-rows"
        ? o.source
        : null,
    lotsMaxSyncedAt: toSyncedAtIso(o.lotsMaxSyncedAt),
    lotsMaxSyncedAtByWarehouse: byWh,
    customersMaxSyncedAt: toSyncedAtIso(o.customersMaxSyncedAt),
  };
}

function mapRowSyncedAt(row: Shipment): Shipment {
  if (!row || typeof row !== "object") return row;
  const raw = row as Shipment & { synced_at?: unknown };
  const syncedAt = toSyncedAtIso(raw.syncedAt ?? raw.synced_at);
  if (syncedAt == null && raw.syncedAt == null && raw.synced_at == null) return row;
  return { ...row, syncedAt };
}

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
  const ecargoScscStore = normalizeEcargoScscStore(
    "ecargoScscStore" in o ? o.ecargoScscStore : undefined
  );

  return {
    version: o.version,
    rows: (o.rows as Shipment[]).map(mapRowSyncedAt),
    customers,
    airlineLabelOverrides,
    printerProfiles,
    esidRegistrantStore,
    esidAgentStore,
    ecargoScscStore,
    syncMeta: parseSyncMeta(o.syncMeta),
  };
}
