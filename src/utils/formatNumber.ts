/**
 * Dấu phân cách hàng nghìn — chờ chốt.
 * `localStorage['tecsops.number.thousands']`: `comma` (mặc định) | `dot` | `space` | `none`.
 */
export const THOUSANDS_SEPARATOR_KEY = "tecsops.number.thousands";

export type ThousandsSeparator = "comma" | "dot" | "space" | "none";

export function getThousandsSeparator(): ThousandsSeparator {
  try {
    const raw = globalThis.localStorage?.getItem(THOUSANDS_SEPARATOR_KEY);
    if (raw === "dot" || raw === "space" || raw === "none" || raw === "comma") return raw;
  } catch {
    /* localStorage có thể bị chặn */
  }
  return "comma";
}

export function formatGroupedNumber(
  value: number,
  opts?: { maxFractionDigits?: number; minFractionDigits?: number },
): string {
  if (!Number.isFinite(value)) return "0";
  const sep = getThousandsSeparator();
  const base = value.toLocaleString("en-US", {
    maximumFractionDigits: opts?.maxFractionDigits ?? 0,
    minimumFractionDigits: opts?.minFractionDigits ?? 0,
    useGrouping: sep !== "none",
  });
  if (sep === "comma" || sep === "none") return base;
  if (sep === "space") return base.replace(/,/g, " ");
  const grouped = base.replace(/,/g, "§");
  return grouped.replace(/\./g, ",").replace(/§/g, ".");
}
