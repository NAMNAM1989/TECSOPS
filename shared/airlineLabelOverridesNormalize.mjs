/**
 * Chuẩn hóa airline label overrides — nguồn sự thật cho server + client.
 * Sửa luôn tên bị dính chữ do bug Lưu cũ (`replace(/\s+/g, "")`).
 */

import {
  DEFAULT_AIRLINE_BY_AWB_PREFIX,
  DEFAULT_AIRLINE_BY_FLIGHT_PREFIX,
} from "./airlineLabelDefaults.mjs";

export function emptyAirlineLabelOverrides() {
  return { byAwbPrefix: {}, byFlightPrefix: {} };
}

const MAX_NAME_LEN = 80;
const MAX_MAP_ENTRIES = 120;

/** Hậu tố thường gặp — dài trước để tách Singaporeairlines → Singapore + AIRLINES. */
const AIRLINE_NAME_SUFFIXES = [
  "AIRLINES",
  "AIRWAYS",
  "AIRLINE",
  "PACIFIC",
  "EXPRESS",
  "CARGO",
  "AIR",
];

let airlineNameDictCache = null;

function compactAirlineKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function airlineNameDictionary() {
  if (airlineNameDictCache) return airlineNameDictCache;
  const dict = Object.create(null);
  for (const name of [
    ...Object.values(DEFAULT_AIRLINE_BY_AWB_PREFIX),
    ...Object.values(DEFAULT_AIRLINE_BY_FLIGHT_PREFIX),
  ]) {
    const k = compactAirlineKey(name);
    if (k && !dict[k]) dict[k] = String(name);
  }
  // Alias người dùng hay gõ khi bị dính
  dict.singaporeairlines = "SINGAPORE AIRLINES";
  dict.vietnamairlines = "VIETNAM AIRLINES";
  dict.vietjetair = "VIETJET AIR";
  dict.cathaypacific = "CATHAY PACIFIC";
  airlineNameDictCache = dict;
  return dict;
}

function trimSpaces(s) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
}

/**
 * Tách tên hãng bị dính (Singaporeairlines / SINGAPOREAIRLINES).
 * Giữ nguyên nếu đã có khoảng trắng.
 */
export function repairGluedAirlineDisplayName(raw) {
  const name = trimSpaces(raw);
  if (!name) return "";
  if (/\s/.test(name)) return name;

  const dictHit = airlineNameDictionary()[compactAirlineKey(name)];
  if (dictHit) return dictHit;

  // camelCase / PascalCase: SingaporeAirlines → Singapore Airlines
  let spaced = name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  if (!/\s/.test(spaced)) {
    const upper = spaced.toUpperCase();
    for (const suf of AIRLINE_NAME_SUFFIXES) {
      if (!upper.endsWith(suf) || upper.length <= suf.length + 1) continue;
      const head = spaced.slice(0, spaced.length - suf.length);
      if (head.length < 2) continue;
      spaced = `${head} ${suf}`;
      break;
    }
  }

  spaced = trimSpaces(spaced);
  if (!spaced) return name;

  // Nếu sau tách khớp từ điển → dùng tên chuẩn
  const afterHit = airlineNameDictionary()[compactAirlineKey(spaced)];
  if (afterHit) return afterHit;

  return spaced;
}

/** UI: tên dài không có khoảng trắng — có vẻ bị dính. */
export function airlineNameLooksGlued(raw) {
  const t = String(raw ?? "").trim();
  if (t.length < 10) return false;
  if (/\s/.test(t)) return false;
  return /[A-Za-z]{8,}/.test(t);
}

function trimName(s) {
  return repairGluedAirlineDisplayName(s);
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
