import type { Warehouse } from "../types/shipment";

const URL_KEY = "tecsops.sheetBookUrl";
const WH_FILTER_KEY = "tecsops.sheetWarehouseFilter";
const MAPPING_KEY = "tecsops.sheetColMapping.v1";

export type SheetWarehouseFilter = Warehouse | "ALL";

export type SheetColMappingPrefs = {
  /** fingerprint header row (joined kinds) */
  headerFingerprint: string;
  /** kind → column index */
  colMap: Record<string, number>;
  updatedAt: string;
  spreadsheetId?: string;
};

export function loadSheetBookUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveSheetBookUrl(url: string): void {
  try {
    localStorage.setItem(URL_KEY, url.trim());
  } catch {
    /* ignore */
  }
}

export function loadSheetWarehouseFilter(): SheetWarehouseFilter {
  try {
    const v = localStorage.getItem(WH_FILTER_KEY);
    if (
      v === "ALL" ||
      v === "TECS-TCS" ||
      v === "TECS-SCSC" ||
      v === "TCS" ||
      v === "SCSC"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "ALL";
}

export function saveSheetWarehouseFilter(filter: SheetWarehouseFilter): void {
  try {
    localStorage.setItem(WH_FILTER_KEY, filter);
  } catch {
    /* ignore */
  }
}

export function loadSheetColMapping(
  spreadsheetId?: string
): SheetColMappingPrefs | null {
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SheetColMappingPrefs;
    if (!parsed?.headerFingerprint || !parsed?.colMap) return null;
    if (
      spreadsheetId &&
      parsed.spreadsheetId &&
      parsed.spreadsheetId !== spreadsheetId
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSheetColMapping(prefs: SheetColMappingPrefs): void {
  try {
    localStorage.setItem(MAPPING_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function clearSheetColMapping(): void {
  try {
    localStorage.removeItem(MAPPING_KEY);
  } catch {
    /* ignore */
  }
}

/** Fingerprint từ danh sách header cells (đã lowercase). */
export function sheetHeaderFingerprint(headers: string[]): string {
  return headers
    .map((h) =>
      String(h || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("|");
}
