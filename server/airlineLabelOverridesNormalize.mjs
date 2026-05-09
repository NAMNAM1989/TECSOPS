export function emptyAirlineLabelOverrides() {
  return { byAwbPrefix: {}, byFlightPrefix: {} };
}

/** Đồng bộ với `src/utils/airlineLabelOverridesCore.ts` */
export function normalizeAirlineLabelOverridesLoose(raw) {
  const empty = emptyAirlineLabelOverrides();
  if (!raw || typeof raw !== "object") return empty;
  const byAwbPrefix = {};
  const byFlightPrefix = {};
  const maxEntries = 120;
  const maxName = 80;

  const awb = raw.byAwbPrefix;
  if (awb && typeof awb === "object") {
    let n = 0;
    for (const [k, v] of Object.entries(awb)) {
      if (n >= maxEntries) break;
      const d = String(k).replace(/\D/g, "");
      if (!d) continue;
      const key = d.slice(0, 3).padStart(3, "0");
      const name = String(v ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxName);
      if (name) {
        byAwbPrefix[key] = name;
        n += 1;
      }
    }
  }

  const fp = raw.byFlightPrefix;
  if (fp && typeof fp === "object") {
    let n = 0;
    for (const [k, v] of Object.entries(fp)) {
      if (n >= maxEntries) break;
      const key = String(k)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 3);
      if (key.length < 2) continue;
      const name = String(v ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxName);
      if (name) {
        byFlightPrefix[key] = name;
        n += 1;
      }
    }
  }

  return { byAwbPrefix, byFlightPrefix };
}
