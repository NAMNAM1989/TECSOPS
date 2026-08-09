import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbDigitsKey, formatAwb } from "./awbFormat";

/** UI mới chỉ còn job PDF; Quét/Điền/Submit có endpoint workspace riêng. */
export type TcsPortalAction = "DOWNLOAD";

/** Kho portal TCS — stamp job / filter bootstrap. */
export type TcsPortalWarehouse = Extract<Warehouse, "TECS-TCS" | "TCS">;

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
  warehouse: TcsPortalWarehouse;
  ops_status?: string;
};

export type TcsPortalJobPayload = {
  source: "ops";
  warehouse: TcsPortalWarehouse;
  sessionDate: string;
  /** Snake_case cho agent Python */
  session_date: string;
  dry_run: boolean;
  mock: boolean;
  confirm_register: boolean;
  rows: TcsPortalJobRow[];
  createdAt: string;
};

export function asTcsPortalWarehouse(
  w: Warehouse | string | undefined | null
): TcsPortalWarehouse | null {
  const t = String(w || "").trim();
  if (t === "TECS-TCS" || t === "TCS") return t;
  return null;
}

export function shipmentsEligibleForTcsPortal(
  rows: readonly Shipment[],
  sessionYmd: string,
  opts?: { onlyCompleted?: boolean; warehouse?: TcsPortalWarehouse }
): Shipment[] {
  return rows.filter((s) => {
    if (!isTcsWarehouse(s.warehouse)) return false;
    if (opts?.warehouse && s.warehouse !== opts.warehouse) return false;
    if (String(s.sessionDate || "").trim() !== sessionYmd) return false;
    if (awbDigitsKey(s.awb).length !== 11) return false;
    if (opts?.onlyCompleted && !OPS_STATUS_READY_FOR_PDF.has(s.status)) return false;
    return true;
  });
}

/** Status Ops không bị ghi đè khi quét ESID (đã qua bước tiếp nhận). */
export const SKIP_RECEPTION_STATUS_UPDATE: ReadonlySet<ShipmentStatus> = new Set([
  "RECEPTION_COMPLETED",
  "WEIGH_SLIP",
  "COMPLETED",
]);

export function isOpsReceptionAlreadyDone(status: ShipmentStatus): boolean {
  return SKIP_RECEPTION_STATUS_UPDATE.has(status);
}

/**
 * Lô còn cần đối soát Quét tiếp nhận: đúng kho+ngày+AWB, chưa RECEPTION_COMPLETED
 * (và chưa WEIGH_SLIP / COMPLETED).
 */
export function shipmentsPendingReceptionScan(
  rows: readonly Shipment[],
  sessionYmd: string,
  opts?: { warehouse?: TcsPortalWarehouse }
): Shipment[] {
  return shipmentsEligibleForTcsPortal(rows, sessionYmd, opts).filter(
    (s) => !isOpsReceptionAlreadyDone(s.status)
  );
}

/**
 * Lô Ops cần gán HOÀN THÀNH TIẾP NHẬN sau khi quét ESID (ready trên TCS).
 */
export function shipmentsToMarkReceptionCompleted(
  rows: readonly Shipment[],
  sessionYmd: string,
  readyAwbs: readonly string[],
  opts?: { warehouse?: TcsPortalWarehouse }
): Shipment[] {
  const ready = new Set(
    readyAwbs.map((a) => awbDigitsKey(a)).filter((d) => d.length === 11)
  );
  if (!ready.size) return [];
  return shipmentsEligibleForTcsPortal(rows, sessionYmd, {
    warehouse: opts?.warehouse,
  }).filter((s) => {
    if (!ready.has(awbDigitsKey(s.awb))) return false;
    if (isOpsReceptionAlreadyDone(s.status)) return false;
    return true;
  });
}

/** Điều kiện Điền ESID từng lô theo kho đang thao tác. */
export function canFillEsidForPortal(
  shipment: Shipment,
  portalWarehouse: TcsPortalWarehouse
): { ok: true } | { ok: false; reason: string } {
  const rowPortal = asTcsPortalWarehouse(shipment.warehouse);
  if (!rowPortal) {
    return { ok: false, reason: "Chỉ kho TECS-TCS / TCS mới điền khai báo ESID." };
  }
  if (rowPortal !== portalWarehouse) {
    return {
      ok: false,
      reason: `Đang thao tác kho ${portalWarehouse} — chọn kho ${rowPortal} trên Ops rồi Điền lại.`,
    };
  }
  if (awbDigitsKey(shipment.awb).length !== 11) {
    return { ok: false, reason: "AWB phải đủ 11 số để điền ESID." };
  }
  if (!isOpsReceptionAlreadyDone(shipment.status)) {
    return {
      ok: false,
      reason:
        "Chỉ điền lô đã Hoàn thành tiếp nhận — bấm «Quét tiếp nhận» trước (đúng kho + ngày).",
    };
  }
  return { ok: true };
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
    /** Chỉ lô đúng kho portal (TECS-TCS hoặc TCS). */
    warehouse?: TcsPortalWarehouse;
    /** Chỉ gửi các AWB (11 số) trong tập này — dùng sau khi quét ESID ready */
    awbDigitsFilter?: ReadonlySet<string> | readonly string[];
  }
): TcsPortalJobPayload {
  let eligible = shipmentsEligibleForTcsPortal(rows, opts.sessionYmd, {
    onlyCompleted: opts.onlyCompleted,
    warehouse: opts.warehouse,
  });
  if (opts.awbDigitsFilter) {
    const allow = new Set(
      [...opts.awbDigitsFilter].map((a) => awbDigitsKey(a)).filter((d) => d.length === 11)
    );
    eligible = eligible.filter((s) => allow.has(awbDigitsKey(s.awb)));
  }
  const portalWh: TcsPortalWarehouse =
    opts.warehouse ||
    asTcsPortalWarehouse(eligible[0]?.warehouse) ||
    "TECS-TCS";
  const jobRows: TcsPortalJobRow[] = eligible.map((s) => {
    const digits = awbDigitsKey(s.awb);
    const rowWh = asTcsPortalWarehouse(s.warehouse) || portalWh;
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
      warehouse: rowWh,
      ops_status: s.status,
    };
  });
  return {
    source: "ops",
    warehouse: portalWh,
    sessionDate: opts.sessionYmd,
    session_date: opts.sessionYmd,
    dry_run: opts.dryRun ?? false,
    mock: opts.mock ?? false,
    confirm_register: opts.confirmRegister ?? false,
    rows: jobRows,
    createdAt: new Date().toISOString(),
  };
}
