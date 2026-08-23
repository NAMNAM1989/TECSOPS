export const SYNC_DISPLAY_TIME_ZONE: "Asia/Saigon";

export function parseSyncedAtMs(raw: unknown): number | null;
export function toSyncedAtIso(raw: unknown): string | null;
export function maxSyncedAtMs(values: readonly unknown[]): number | null;
export function lotSyncMatchKey(awb: unknown, warehouse: unknown, sessionDate: unknown): string;
export function maxLotSyncedAtMs(
  lots: readonly unknown[],
  opts?: { warehouse?: string; sessionDate?: string }
): number | null;
export function maxCustomerSyncedAtMs(customers: readonly unknown[]): number | null;
export function buildLotsSyncByWarehouse(lots: readonly unknown[]): Record<string, string | null>;
export function mergeLotSyncedAt<T>(rows: T[], namnamLots: readonly unknown[]): T[];
export function mergeCustomerSyncedAt<T>(customers: T[], opsCustomers: readonly unknown[]): T[];
export function resolveOpsLotSyncedAtMs(opts?: {
  lots?: readonly unknown[];
  warehouse?: string;
  sessionDate?: string;
  warehouseMaxSyncedAt?: unknown;
}): number | null;
export function resolveCustomersSyncedAtMs(opts?: {
  customers?: readonly unknown[];
  customersMaxSyncedAt?: unknown;
}): number | null;
export function formatSyncClockIct(at: unknown): string;
export function formatRelativeSync(at: unknown, now?: number): string;
export function formatSyncedPhrase(at: unknown, now?: number): string;
