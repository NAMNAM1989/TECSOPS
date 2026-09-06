import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { clampAirlineLabelOverrides } from "./airlineLabelOverridesCore";

export const AIRLINE_CATALOG_CACHE_KEY = "tecsops-airline-catalog-v1";

export type SupabaseAirlineRow = {
  iata_code?: string | null;
  name?: string | null;
  awb_prefix?: string | null;
  status?: string | null;
};

export type AirlineCatalogCache = {
  syncedAt: string;
  maps: AirlineLabelOverrides;
};

export type DataSupabaseConfig = {
  url: string;
  key: string;
};

function trimName(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeIata(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2);
}

function normalizeAwb(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 3);
  if (digits.length !== 3) return null;
  return digits.padStart(3, "0");
}

/** Map rows ACTIVE → lookup in tem (IATA / AWB → `name`). */
export function normalizeAirlinesToLabelMaps(
  rows: readonly SupabaseAirlineRow[]
): AirlineLabelOverrides {
  const byFlightPrefix: Record<string, string> = {};
  const byAwbPrefix: Record<string, string> = {};

  for (const row of rows) {
    if (row.status != null && String(row.status).toUpperCase() !== "ACTIVE") continue;
    const name = trimName(String(row.name ?? ""));
    if (!name) continue;

    const iata = normalizeIata(row.iata_code);
    if (iata.length === 2) {
      byFlightPrefix[iata] = name;
    }

    const awb = normalizeAwb(row.awb_prefix);
    if (awb) {
      byAwbPrefix[awb] = name;
    }
  }

  return clampAirlineLabelOverrides({ byFlightPrefix, byAwbPrefix });
}

export function dataSupabaseConfig(
  env: ImportMetaEnv | Record<string, string | undefined> = import.meta.env
): DataSupabaseConfig | null {
  const url = String(env.VITE_DATA_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const key = String(env.VITE_DATA_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, key };
}

export function loadAirlineCatalogCache(): AirlineCatalogCache | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(AIRLINE_CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AirlineCatalogCache>;
    if (!parsed || typeof parsed.syncedAt !== "string" || !parsed.maps) return null;
    return {
      syncedAt: parsed.syncedAt,
      maps: clampAirlineLabelOverrides(parsed.maps),
    };
  } catch {
    return null;
  }
}

export function saveAirlineCatalogCache(cache: AirlineCatalogCache): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      AIRLINE_CATALOG_CACHE_KEY,
      JSON.stringify({
        syncedAt: cache.syncedAt,
        maps: clampAirlineLabelOverrides(cache.maps),
      })
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearAirlineCatalogCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(AIRLINE_CATALOG_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchAirlinesFromSupabase(
  cfg: DataSupabaseConfig,
  fetchImpl: typeof fetch = fetch
): Promise<AirlineCatalogCache> {
  const select = "iata_code,name,awb_prefix,status";
  const qs = new URLSearchParams({
    select,
    status: "eq.ACTIVE",
    order: "iata_code.asc",
  });
  const res = await fetchImpl(`${cfg.url}/rest/v1/airlines?${qs.toString()}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase airlines HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error("Supabase airlines: response không phải mảng");
  }
  return {
    syncedAt: new Date().toISOString(),
    maps: normalizeAirlinesToLabelMaps(body as SupabaseAirlineRow[]),
  };
}
