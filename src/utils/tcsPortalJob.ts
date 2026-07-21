import type { Shipment, ShipmentStatus } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbDigitsKey, formatAwb } from "./awbFormat";

export type TcsPortalAction = "LOOKUP" | "REGISTER" | "DOWNLOAD" | "PRINT";

/**
 * Lọc tùy chọn theo status Ops khi tick «chỉ lô hoàn thành» trên Cổng TCS.
 */
export const OPS_STATUS_READY_FOR_PDF: ReadonlySet<ShipmentStatus> = new Set([
  "RECEPTION_COMPLETED",
  "COMPLETED",
  "WEIGH_SLIP",
]);

export type TcsPortalJobRow = {
  shipment_id: string;
  awb: string;
  action: TcsPortalAction;
  flight_date?: string;
  flight_no?: string;
  pcs?: number | null;
  gross_weight?: number | null;
  document_type?: string;
  print_copies?: number;
  note?: string;
  warehouse: "TECS-TCS";
  ops_status?: string;
};

export type TcsPortalJobPayload = {
  source: "ops";
  warehouse: "TECS-TCS";
  sessionDate: string;
  /** Snake_case cho agent Python */
  session_date: string;
  dry_run: boolean;
  mock: boolean;
  confirm_register: boolean;
  rows: TcsPortalJobRow[];
  createdAt: string;
};

export function shipmentsEligibleForTcsPortal(
  rows: readonly Shipment[],
  sessionYmd: string,
  opts?: { onlyCompleted?: boolean }
): Shipment[] {
  return rows.filter((s) => {
    if (!isTcsWarehouse(s.warehouse)) return false;
    if (String(s.sessionDate || "").trim() !== sessionYmd) return false;
    if (awbDigitsKey(s.awb).length !== 11) return false;
    if (opts?.onlyCompleted && !OPS_STATUS_READY_FOR_PDF.has(s.status)) return false;
    return true;
  });
}

/** Status Ops không bị ghi đè khi quét ESID (đã qua bước tiếp nhận). */
const SKIP_RECEPTION_STATUS_UPDATE: ReadonlySet<ShipmentStatus> = new Set([
  "RECEPTION_COMPLETED",
  "WEIGH_SLIP",
  "COMPLETED",
]);

/**
 * Lô Ops cần gán HOÀN THÀNH TIẾP NHẬN sau khi quét ESID (ready trên TCS).
 */
export function shipmentsToMarkReceptionCompleted(
  rows: readonly Shipment[],
  sessionYmd: string,
  readyAwbs: readonly string[]
): Shipment[] {
  const ready = new Set(
    readyAwbs.map((a) => awbDigitsKey(a)).filter((d) => d.length === 11)
  );
  if (!ready.size) return [];
  return shipmentsEligibleForTcsPortal(rows, sessionYmd).filter((s) => {
    if (!ready.has(awbDigitsKey(s.awb))) return false;
    if (SKIP_RECEPTION_STATUS_UPDATE.has(s.status)) return false;
    return true;
  });
}

export function buildTcsPortalJob(
  rows: readonly Shipment[],
  opts: {
    sessionYmd: string;
    action: TcsPortalAction;
    dryRun?: boolean;
    mock?: boolean;
    confirmRegister?: boolean;
    onlyCompleted?: boolean;
    /** Chỉ gửi các AWB (11 số) trong tập này — dùng sau khi quét ESID ready */
    awbDigitsFilter?: ReadonlySet<string> | readonly string[];
  }
): TcsPortalJobPayload {
  let eligible = shipmentsEligibleForTcsPortal(rows, opts.sessionYmd, {
    onlyCompleted: opts.onlyCompleted,
  });
  if (opts.awbDigitsFilter) {
    const allow = new Set(
      [...opts.awbDigitsFilter].map((a) => awbDigitsKey(a)).filter((d) => d.length === 11)
    );
    eligible = eligible.filter((s) => allow.has(awbDigitsKey(s.awb)));
  }
  const jobRows: TcsPortalJobRow[] = eligible.map((s) => {
    const digits = awbDigitsKey(s.awb);
    return {
      shipment_id: s.id,
      awb: formatAwb(digits),
      action: opts.action,
      flight_date: s.flightDate || "",
      flight_no: s.flight || "",
      pcs: s.pcs,
      gross_weight: s.kg,
      document_type: "ESID",
      print_copies: 1,
      note: s.note || "",
      warehouse: "TECS-TCS",
      ops_status: s.status,
    };
  });
  return {
    source: "ops",
    warehouse: "TECS-TCS",
    sessionDate: opts.sessionYmd,
    session_date: opts.sessionYmd,
    dry_run: opts.dryRun ?? false,
    mock: opts.mock ?? false,
    confirm_register: opts.confirmRegister ?? false,
    rows: jobRows,
    createdAt: new Date().toISOString(),
  };
}