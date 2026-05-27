export const HQ_HASH_PREFIX = "#/hq/";

export function parseHqHash(hash = typeof window !== "undefined" ? window.location.hash : ""): string | null {
  if (!hash.startsWith(HQ_HASH_PREFIX)) return null;
  const raw = hash.slice(HQ_HASH_PREFIX.length).split("?")[0]?.trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function openHqPage(shipmentId: string): void {
  if (typeof window === "undefined") return;
  const next = `${HQ_HASH_PREFIX}${encodeURIComponent(shipmentId)}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function closeHqPage(): void {
  if (typeof window === "undefined") return;
  if (window.location.hash.startsWith(HQ_HASH_PREFIX)) {
    window.location.hash = "";
  }
}

export function isHqHashActive(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  return hash.startsWith(HQ_HASH_PREFIX);
}
