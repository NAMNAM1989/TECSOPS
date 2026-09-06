import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  AIRLINE_CATALOG_CACHE_KEY,
  clearAirlineCatalogCache,
  dataSupabaseConfig,
  fetchAirlinesFromSupabase,
  loadAirlineCatalogCache,
  normalizeAirlinesToLabelMaps,
  saveAirlineCatalogCache,
} from "./airlineCatalogFromSupabase";

describe("normalizeAirlinesToLabelMaps", () => {
  it("maps IATA → name and AWB → name", () => {
    const maps = normalizeAirlinesToLabelMaps([
      {
        iata_code: "vn",
        name: "  Vietnam Airlines  ",
        awb_prefix: "738",
        status: "ACTIVE",
      },
      {
        iata_code: "VJ",
        name: "Vietjet Air",
        awb_prefix: null,
        status: "ACTIVE",
      },
    ]);
    expect(maps.byFlightPrefix.VN).toBe("Vietnam Airlines");
    expect(maps.byFlightPrefix.VJ).toBe("Vietjet Air");
    expect(maps.byAwbPrefix["738"]).toBe("Vietnam Airlines");
    expect(maps.byAwbPrefix).not.toHaveProperty("000");
  });

  it("skips non-ACTIVE and empty names", () => {
    const maps = normalizeAirlinesToLabelMaps([
      { iata_code: "XX", name: "Gone", status: "INACTIVE" },
      { iata_code: "YY", name: "   ", status: "ACTIVE" },
      { iata_code: "ZZ", name: "Ok", status: "ACTIVE" },
    ]);
    expect(maps.byFlightPrefix).toEqual({ ZZ: "Ok" });
  });
});

describe("dataSupabaseConfig", () => {
  it("returns null when env missing", () => {
    expect(dataSupabaseConfig({})).toBeNull();
    expect(dataSupabaseConfig({ VITE_DATA_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
  });

  it("trims trailing slash", () => {
    const cfg = dataSupabaseConfig({
      VITE_DATA_SUPABASE_URL: "https://cuakkgauyutapdznqhge.supabase.co/",
      VITE_DATA_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(cfg).toEqual({
      url: "https://cuakkgauyutapdznqhge.supabase.co",
      key: "anon-key",
    });
  });
});

describe("airline catalog cache", () => {
  beforeEach(() => {
    clearAirlineCatalogCache();
  });

  afterEach(() => {
    clearAirlineCatalogCache();
  });

  it("round-trips cache", () => {
    saveAirlineCatalogCache({
      syncedAt: "2026-09-06T00:00:00.000Z",
      maps: { byAwbPrefix: { "738": "Vietnam Airlines" }, byFlightPrefix: { VN: "Vietnam Airlines" } },
    });
    const loaded = loadAirlineCatalogCache();
    expect(loaded?.syncedAt).toBe("2026-09-06T00:00:00.000Z");
    expect(loaded?.maps.byFlightPrefix.VN).toBe("Vietnam Airlines");
    expect(localStorage.getItem(AIRLINE_CATALOG_CACHE_KEY)).toBeTruthy();
  });
});

describe("fetchAirlinesFromSupabase", () => {
  it("fetches ACTIVE rows and builds maps", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { iata_code: "QR", name: "Qatar Airways", awb_prefix: "157", status: "ACTIVE" },
      ],
    })) as unknown as typeof fetch;

    const cache = await fetchAirlinesFromSupabase(
      { url: "https://example.supabase.co", key: "k" },
      fetchImpl
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = String(vi.mocked(fetchImpl).mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/rest/v1/airlines?");
    expect(url).toContain("status=eq.ACTIVE");
    expect(cache.maps.byFlightPrefix.QR).toBe("Qatar Airways");
    expect(cache.maps.byAwbPrefix["157"]).toBe("Qatar Airways");
  });

  it("throws on HTTP error", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      fetchAirlinesFromSupabase({ url: "https://example.supabase.co", key: "k" }, fetchImpl)
    ).rejects.toThrow(/401/);
  });
});
