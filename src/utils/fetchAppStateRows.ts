import type { Shipment } from "../types/shipment";
import type { AppState } from "./shipmentMutations";
import { credFetch } from "../apiFetch";
import { parseAppState } from "./appStateParse";

/**
 * Lấy snapshot `rows` từ máy chủ (tránh chỉ dùng state React có thể lệch/thiếu khi xuất Excel).
 * Trả `null` nếu offline hoặc phản hồi không hợp lệ.
 */
export async function fetchAppStateRows(): Promise<Shipment[] | null> {
  const s = await fetchAppStateSnapshot();
  return s?.rows ?? null;
}

/** Snapshot đầy đủ (lô + danh bạ khách) — dùng khi xuất Excel cần mã khách hàng. */
export async function fetchAppStateSnapshot(): Promise<AppState | null> {
  try {
    const res = await fetch("/api/state", {
      ...credFetch,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    return parseAppState(raw);
  } catch {
    return null;
  }
}
