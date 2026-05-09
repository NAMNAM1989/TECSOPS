import type { Shipment } from "../types/shipment";
import type { AppState } from "./shipmentMutations";
import { credFetch } from "../apiFetch";
import { parseAppState } from "./appStateParse";
import { debugError, debugWarn } from "./debugLog";

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
    if (!res.ok) {
      debugWarn("fetch:app-state", "HTTP", res.status);
      return null;
    }
    const raw: unknown = await res.json();
    return parseAppState(raw);
  } catch (e) {
    debugError("fetch:app-state", e);
    return null;
  }
}

export type UnmatchedCustomerRow = {
  id: string;
  awb: string;
  sessionDate: string;
  warehouse: string;
  flight: string;
  flightDate: string;
  customer: string;
  customerCode: string;
  customerId: string;
  suggestedCustomerId: string;
  suggestedCustomerCode: string;
  suggestedCustomerName: string;
};

export type UnmatchedCustomerReport = {
  generatedAt: string;
  totalRows: number;
  unmatchedCount: number;
  rows: UnmatchedCustomerRow[];
};

export async function fetchUnmatchedCustomerReport(): Promise<UnmatchedCustomerReport | null> {
  try {
    const res = await fetch("/api/reports/customer-unmatched", {
      ...credFetch,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      debugWarn("fetch:customer-unmatched", "HTTP", res.status);
      return null;
    }
    const raw = (await res.json()) as Partial<UnmatchedCustomerReport>;
    if (!Array.isArray(raw.rows)) {
      debugWarn("fetch:customer-unmatched", "invalid payload");
      return null;
    }
    return {
      generatedAt: String(raw.generatedAt ?? ""),
      totalRows: Number(raw.totalRows ?? 0),
      unmatchedCount: Number(raw.unmatchedCount ?? raw.rows.length),
      rows: raw.rows.map((r) => ({
        id: String(r.id ?? ""),
        awb: String(r.awb ?? ""),
        sessionDate: String(r.sessionDate ?? ""),
        warehouse: String(r.warehouse ?? ""),
        flight: String(r.flight ?? ""),
        flightDate: String(r.flightDate ?? ""),
        customer: String(r.customer ?? ""),
        customerCode: String(r.customerCode ?? ""),
        customerId: String(r.customerId ?? ""),
        suggestedCustomerId: String(r.suggestedCustomerId ?? ""),
        suggestedCustomerCode: String(r.suggestedCustomerCode ?? ""),
        suggestedCustomerName: String(r.suggestedCustomerName ?? ""),
      })),
    };
  } catch (e) {
    debugError("fetch:customer-unmatched", e);
    return null;
  }
}
