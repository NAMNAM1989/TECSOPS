/**
 * Kiểu dữ liệu quét / kết quả job TCS dùng chung Ops ↔ Ext.
 * HTTP `/tcs-agent` và portal-worker đã gỡ (B1) — Điền / Quét / PDF chỉ qua Chrome Ext.
 */

export type TcsAgentJobResultRow = {
  stt: number;
  awb: string;
  action: string;
  normalized_status: string;
  tcs_status_raw?: string;
  downloaded_file?: string;
  download_url?: string;
  pdf_name?: string;
  print_status?: string;
  cache_hit?: boolean;
  hot_path?: boolean;
  error_code?: string;
  error_message?: string;
  shipment_id?: string;
};

export type TcsEsidScanItem = {
  awb: string;
  awb_last8?: string;
  ready: boolean;
  normalized_status?: string;
  tcs_status?: string;
  flight?: string;
  flight_date?: string;
  esid_code?: string;
  raw?: string;
  error?: string;
};

export type TcsEsidScanResponse = {
  ok: boolean;
  items?: TcsEsidScanItem[];
  ready?: TcsEsidScanItem[];
  total?: number;
  ready_count?: number;
  list_total?: number;
  reception_total?: number;
  error?: string;
  message?: string;
};

/**
 * Chỉ lấy AWB Ext xác nhận ready + RECEPTION_COMPLETED.
 * Không đọc raw/message (tránh khớp nhầm cụm «Hoàn thành tiếp nhận» trong lỗi).
 */
export function pickEsidScanReadyItems(
  res: Pick<TcsEsidScanResponse, "ready" | "items">
): TcsEsidScanItem[] {
  const map = new Map<string, TcsEsidScanItem>();
  for (const r of [...(res.ready || []), ...(res.items || [])]) {
    if (!r?.ready || r.normalized_status !== "RECEPTION_COMPLETED") continue;
    const d = String(r.awb || "").replace(/\D/g, "").slice(0, 11);
    if (d.length === 11) map.set(d, { ...r, awb: d, ready: true });
  }
  return [...map.values()];
}
