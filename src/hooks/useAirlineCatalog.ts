import { useCallback, useEffect, useRef, useState } from "react";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import {
  dataSupabaseConfig,
  fetchAirlinesFromSupabase,
  loadAirlineCatalogCache,
  saveAirlineCatalogCache,
} from "../utils/airlineCatalogFromSupabase";

export type AirlineCatalogStatus = "idle" | "loading" | "ready" | "error" | "unconfigured";

export type AirlineCatalogState = {
  maps: AirlineLabelOverrides | null;
  /** true khi maps đến từ Supabase cache/fetch (không phải fallback defaults). */
  fromCatalog: boolean;
  status: AirlineCatalogStatus;
  syncedAt: string | null;
  error: string | null;
  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Master hãng bay từ Supabase (client) + localStorage.
 * Cache trống → tự fetch một lần; `refresh` ghi đè toàn bộ.
 */
export function useAirlineCatalog(): AirlineCatalogState {
  const cached = typeof window !== "undefined" ? loadAirlineCatalogCache() : null;
  const [maps, setMaps] = useState<AirlineLabelOverrides | null>(cached?.maps ?? null);
  const [syncedAt, setSyncedAt] = useState<string | null>(cached?.syncedAt ?? null);
  const [status, setStatus] = useState<AirlineCatalogStatus>(() =>
    cached ? "ready" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const runFetch = useCallback(async (force: boolean) => {
    if (inflight.current) return inflight.current;

    const job = (async () => {
      const cfg = dataSupabaseConfig();
      if (!cfg) {
        setStatus("unconfigured");
        setError("Thiếu VITE_DATA_SUPABASE_URL / VITE_DATA_SUPABASE_ANON_KEY");
        return;
      }

      if (!force) {
        const existing = loadAirlineCatalogCache();
        if (existing) {
          setMaps(existing.maps);
          setSyncedAt(existing.syncedAt);
          setStatus("ready");
          setError(null);
          return;
        }
      }

      setStatus("loading");
      setError(null);
      try {
        const next = await fetchAirlinesFromSupabase(cfg);
        saveAirlineCatalogCache(next);
        setMaps(next.maps);
        setSyncedAt(next.syncedAt);
        setStatus("ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Không tải được hãng bay";
        setError(msg);
        const fallback = loadAirlineCatalogCache();
        if (fallback) {
          setMaps(fallback.maps);
          setSyncedAt(fallback.syncedAt);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      }
    })();

    inflight.current = job;
    try {
      await job;
    } finally {
      inflight.current = null;
    }
  }, []);

  const ensureLoaded = useCallback(async () => {
    await runFetch(false);
  }, [runFetch]);

  const refresh = useCallback(async () => {
    await runFetch(true);
  }, [runFetch]);

  useEffect(() => {
    if (cached) return;
    void ensureLoaded();
    // Bootstrap một lần khi mount nếu chưa có cache (cố ý bỏ deps).
  }, []);

  return {
    maps,
    fromCatalog: maps != null,
    status,
    syncedAt,
    error,
    ensureLoaded,
    refresh,
  };
}
