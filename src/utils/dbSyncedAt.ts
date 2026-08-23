/**
 * Thin typed wrapper — SoT `lots.synced_at` / `ops_customers.synced_at`.
 */
export {
  SYNC_DISPLAY_TIME_ZONE,
  parseSyncedAtMs,
  toSyncedAtIso,
  maxSyncedAtMs,
  lotSyncMatchKey,
  maxLotSyncedAtMs,
  maxCustomerSyncedAtMs,
  buildLotsSyncByWarehouse,
  mergeLotSyncedAt,
  mergeCustomerSyncedAt,
  resolveOpsLotSyncedAtMs,
  resolveCustomersSyncedAtMs,
  formatSyncClockIct,
  formatRelativeSync,
  formatSyncedPhrase,
} from "../../shared/dbSyncedAt.mjs";
