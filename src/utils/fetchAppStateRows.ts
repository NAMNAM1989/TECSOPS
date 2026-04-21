import type { Shipment } from "../types/shipment";
import { credFetch } from "../apiFetch";

/**
 * Lấy snapshot `rows` từ máy chủ (tránh chỉ dùng state React có thể lệch/thiếu khi xuất Excel).
 * Trả `null` nếu offline hoặc phản hồi không hợp lệ.
 */
export async function fetchAppStateRows(): Promise<Shipment[] | null> {
  try {
    const res = await fetch("/api/state", {
      ...credFetch,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== "object") return null;
    const rows = (raw as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) return null;
    return rows as Shipment[];
  } catch {
    return null;
  }
}
