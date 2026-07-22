/**
 * Chuẩn hóa airline label overrides — nguồn sự thật cho server + client.
 */

export function emptyAirlineLabelOverrides() {
  return { byAwbPrefix: {}, byFlightPrefix: {} };
}

const MAX_NAME_LEN = 80;
const MAX_MAP_ENTRIES = 120;

function trimName(s) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
}

/** Chuẩn hoá payload từ app / localStorage / API / Postgres. */
export function normalizeAirlineLabelOverridesLoose(raw) {
  const out = emptyAirlineLabelOverrides();
  if (!raw || typeof raw !== "object") return out;

  const awb = raw.byAwbPrefix;
  if (awb && typeof awb === "object") {
    let n = 0;
    for (const [k, v] of Object.entries(awb)) {
      if (n >= MAX_MAP_ENTRIES) break;
      const digits = String(k).replace(/\D/g, "");
      if (!digits) continue;
      const key = digits.slice(0, 3).padStart(3, "0");
      const name = trimName(v);
      if (!name) continue;
      out.byAwbPrefix[key] = name;
      n += 1;
    }
  }

  const fp = raw.byFlightPrefix;
  if (fp && typeof fp === "object") {
    let n = 0;
    for (const [k, v] of Object.entries(fp)) {
      if (n >= MAX_MAP_ENTRIES) break;
      const key = String(k)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 3);
      if (key.length < 2) continue;
      const name = trimName(v);
      if (!name) continue;
      out.byFlightPrefix[key] = name;
      n += 1;
    }
  }

  return out;
}
