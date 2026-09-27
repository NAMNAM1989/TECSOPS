import type { Warehouse } from "../types/shipment";
import type { StatusFilterValue } from "../components/StatusFilterBar";
import { SHIPMENT_STATUS_ORDER } from "./shipmentWorkflowStatus";

export type OpsUrlState = {
  /** Ngày phiên (YYYY-MM-DD) */
  d?: string;
  /** Kho đang chọn */
  wh?: Warehouse;
  /** Trạng thái đang lọc (ALL, attention, hoặc mã trạng thái cụ thể) */
  st?: StatusFilterValue;
  /** Từ khoá tìm kiếm */
  q?: string;
  /** Ngày bay lọc (ví dụ 26SEP) */
  fd?: string;
  /** Chế độ nhóm (stt, flight...) */
  g?: string;
  /** Mã định danh lô hàng đang mở chi tiết */
  lot?: string;
};

const VALID_WAREHOUSES = new Set<Warehouse>([
  "TECS-TCS",
  "TECS-SCSC",
  "TCS",
  "SCSC",
]);

const VALID_STATUSES = new Set<string>([
  "ALL",
  "attention",
  ...SHIPMENT_STATUS_ORDER,
]);

function pathAndQuery(hash: string): { path: string; query: string } {
  const raw = hash.replace(/^#\/?/, "");
  const q = raw.indexOf("?");
  if (q < 0) return { path: raw.toLowerCase(), query: "" };
  return { path: raw.slice(0, q).toLowerCase(), query: raw.slice(q + 1) };
}

/** Xác định hash có trỏ tới màn hình Ops hay không. */
export function isOpsHash(hash: string): boolean {
  const { path } = pathAndQuery(hash);
  if (
    path === "customers" ||
    path.startsWith("customers/") ||
    path === "stats" ||
    path.startsWith("stats/") ||
    path === "scsc-h21" ||
    path.startsWith("scsc-h21/") ||
    path === "tcs-h21" ||
    path.startsWith("tcs-h21/")
  ) {
    return false;
  }
  return true;
}

/** Đọc trạng thái giao diện Ops từ URL hash query. */
export function parseOpsUrlState(hash: string): Partial<OpsUrlState> {
  if (!isOpsHash(hash)) return {};
  const { query } = pathAndQuery(hash);
  if (!query) return {};

  const sp = new URLSearchParams(query);
  const out: Partial<OpsUrlState> = {};

  const d = sp.get("d");
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    out.d = d;
  }

  const wh = sp.get("wh");
  if (wh && VALID_WAREHOUSES.has(wh as Warehouse)) {
    out.wh = wh as Warehouse;
  }

  const st = sp.get("st");
  if (st && VALID_STATUSES.has(st)) {
    out.st = st as StatusFilterValue;
  }

  const q = sp.get("q");
  if (q && q.trim()) {
    out.q = q.trim();
  }

  const fd = sp.get("fd");
  if (fd && fd.trim()) {
    out.fd = fd.trim().toUpperCase();
  }

  const g = sp.get("g");
  if (g && g.trim()) {
    out.g = g.trim();
  }

  const lot = sp.get("lot");
  if (lot && lot.trim()) {
    out.lot = lot.trim();
  }

  return out;
}

/**
 * Ghi trạng thái giao diện Ops ra URL hash query.
 * Bỏ qua các giá trị mặc định để URL luôn tinh gọn.
 */
export function serializeOpsUrlState(
  state: OpsUrlState,
  options?: { defaultYmd?: string; defaultWarehouse?: Warehouse }
): string {
  const sp = new URLSearchParams();

  if (state.d && state.d !== options?.defaultYmd) {
    sp.set("d", state.d);
  }

  if (state.wh && state.wh !== options?.defaultWarehouse) {
    sp.set("wh", state.wh);
  }

  if (state.st && state.st !== "ALL") {
    sp.set("st", state.st);
  }

  if (state.q && state.q.trim()) {
    sp.set("q", state.q.trim());
  }

  if (state.fd && state.fd.trim()) {
    sp.set("fd", state.fd.trim().toUpperCase());
  }

  if (state.g && state.g !== "stt") {
    sp.set("g", state.g);
  }

  if (state.lot && state.lot.trim()) {
    sp.set("lot", state.lot.trim());
  }

  const queryStr = sp.toString();
  return queryStr ? `#/?${queryStr}` : "#/";
}
