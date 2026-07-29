import { WAREHOUSE_ORDER, warehouseLabel } from "../constants/warehouses";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment, Warehouse } from "../types/shipment";
import { findCustomerEntry } from "./customerBookingResolve";
import {
  cutoffIsoToDateDdMon,
  cutoffIsoToTimeInputText,
  formatCutoffDisplayFromLocalParts,
  splitIsoToLocalDateTime,
  ymdToDdMon,
} from "./bookingDateParse";
import {
  isValidCustomerSyncCode,
  normalizeCustomerShortCode,
  normalizeCustomerSyncCode,
} from "./customerCodeOps";
import { normalizeAgentCode } from "./customerProfileInputFormat";
import { flightDateToYmd } from "./esidDeclareFields";
import { filterShipmentsBySessionYmd } from "./filterShipmentsBySessionYmd";
import { formatKgTotal } from "./formatKgTotal";
import { partitionShipmentsByWarehouse } from "./partitionShipmentsByWarehouse";

export type CargoDayReportRow = {
  stt: number;
  /** AWB — cột Booking */
  booking: string;
  /** Short Code khách (mẫu Hiện Trường) */
  customerShortCode: string;
  /** `kiện/kg` — VD: `12/250.5` */
  pcsKg: string;
  /** Phần số hiệu chuyến — VD: QH201 */
  flight: string;
  /** Phần ngày bay hiển thị — VD: 27JUL */
  flightDateLabel: string;
  /** Ghép sẵn: `QH201 / 27JUL` */
  flightDate: string;
  /**
   * Ngày bay trùng ngày phiên → lô gấp (tô đỏ trên ảnh).
   */
  flightDateUrgent: boolean;
  cutoff: string;
  dest: string;
};

export type CargoDayReportSection = {
  warehouse: Warehouse;
  label: string;
  rows: CargoDayReportRow[];
};

export type CargoDayReportModel = {
  sessionYmd: string;
  /** VD: 27JUL2026 */
  titleDate: string;
  totalLots: number;
  /** Có ít nhất một lô bay cùng ngày phiên */
  hasUrgentFlightDate: boolean;
  /** Chỉ kho có lô */
  sections: CargoDayReportSection[];
};

export function formatCargoReportTitleDate(sessionYmd: string): string {
  const ddmon = ymdToDdMon(sessionYmd);
  const y = sessionYmd.trim().slice(0, 4);
  if (!ddmon || !/^\d{4}$/.test(y)) return sessionYmd.trim() || "—";
  return `${ddmon}${y}`;
}

/** Cutoff hiển thị: `17H - 15APR` (+ note nếu có). */
export function formatCargoReportCutoff(s: Pick<Shipment, "cutoff" | "cutoffNote">): string {
  const note = (s.cutoffNote ?? "").trim();
  const iso = (s.cutoff ?? "").trim();
  if (!iso) return note || "—";

  const { date, hour, minute } = splitIsoToLocalDateTime(iso);
  let main = "";
  if (date) {
    main = formatCutoffDisplayFromLocalParts(date, hour, minute);
  }
  if (!main) {
    const t = cutoffIsoToTimeInputText(iso);
    const d = cutoffIsoToDateDdMon(iso);
    main = t && d ? `${t} - ${d}` : t || d;
  }
  if (main && note) return `${main} ${note}`;
  return main || note || "—";
}

export function formatCargoReportFlightDate(
  s: Pick<Shipment, "flight" | "flightDate">,
): string {
  const flight = (s.flight ?? "").trim();
  const date = (s.flightDate ?? "").trim();
  if (flight && date) return `${flight} / ${date}`;
  return flight || date || "—";
}

export function formatCargoReportBooking(s: Pick<Shipment, "awb">): string {
  const awb = (s.awb ?? "").trim();
  return awb || "—";
}

/** Cột Kiện/Kg — VD: `12/250.5` (thiếu → —). */
export function formatCargoReportPcsKg(
  s: Pick<Shipment, "pcs" | "kg">,
): string {
  const pcsRaw = s.pcs;
  const pcs =
    pcsRaw == null || Number.isNaN(Number(pcsRaw)) ? "—" : String(Number(pcsRaw));
  const kgRaw = s.kg;
  const kg =
    kgRaw == null || !Number.isFinite(Number(kgRaw))
      ? "—"
      : formatKgTotal(Number(kgRaw));
  return `${pcs}/${kg}`;
}

/** Ngày bay (DDMMM) trùng ngày phiên → gấp. */
export function isCargoReportFlightDateUrgent(
  flightDate: string,
  sessionYmd: string,
): boolean {
  const session = sessionYmd.trim();
  if (!session || !flightDate.trim()) return false;
  return flightDateToYmd(flightDate, session) === session;
}

/**
 * Short Code cho ảnh nhóm 2:
 * 1) shortCode danh bạ → 2) Customer Code 2–5 chữ → 3) code/tên trên lô.
 */
export function resolveCargoReportCustomerShortCode(
  s: Pick<Shipment, "customer" | "customerCode" | "customerId">,
  customerDirectory: readonly CustomerDirectoryEntry[],
): string {
  const entry = findCustomerEntry(s as Shipment, customerDirectory);
  if (entry) {
    const short = normalizeCustomerShortCode(entry.shortCode ?? "");
    if (short) return short;
    if (isValidCustomerSyncCode(entry.code)) {
      return normalizeCustomerSyncCode(entry.code);
    }
  }

  const onLotCode = normalizeAgentCode(s.customerCode ?? "");
  if (onLotCode) {
    if (isValidCustomerSyncCode(onLotCode)) {
      return normalizeCustomerSyncCode(onLotCode);
    }
    const shortLot = normalizeCustomerShortCode(onLotCode);
    if (shortLot) return shortLot;
  }

  const name = normalizeCustomerShortCode(s.customer ?? "");
  return name || "—";
}

function cutoffSortKey(s: Shipment): number {
  const iso = (s.cutoff ?? "").trim();
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function sortDayLots(rows: Shipment[]): Shipment[] {
  return [...rows].sort((a, b) => {
    const ca = cutoffSortKey(a);
    const cb = cutoffSortKey(b);
    if (ca !== cb) return ca - cb;
    const fa = (a.flightDate || "").localeCompare(b.flightDate || "");
    if (fa !== 0) return fa;
    return (a.awb || "").localeCompare(b.awb || "");
  });
}

function toReportRows(
  rows: Shipment[],
  sessionYmd: string,
  customerDirectory: readonly CustomerDirectoryEntry[],
): CargoDayReportRow[] {
  return sortDayLots(rows).map((s, i) => {
    const flight = (s.flight ?? "").trim();
    const flightDateLabel = (s.flightDate ?? "").trim();
    return {
      stt: i + 1,
      booking: formatCargoReportBooking(s),
      customerShortCode: resolveCargoReportCustomerShortCode(s, customerDirectory),
      pcsKg: formatCargoReportPcsKg(s),
      flight,
      flightDateLabel,
      flightDate: formatCargoReportFlightDate(s),
      flightDateUrgent: isCargoReportFlightDateUrgent(flightDateLabel, sessionYmd),
      cutoff: formatCargoReportCutoff(s),
      dest: (s.dest ?? "").trim() || "—",
    };
  });
}

/**
 * Báo cáo hàng hóa hiện trường theo ngày phiên Ops.
 * Mọi lô trong ngày; ẩn kho không có lô; Booking = AWB.
 */
export function buildCargoDayReport(
  rows: readonly Shipment[],
  sessionYmd: string,
  customerDirectory: readonly CustomerDirectoryEntry[] = [],
): CargoDayReportModel {
  const dayRows = filterShipmentsBySessionYmd(rows, sessionYmd);
  const buckets = partitionShipmentsByWarehouse(dayRows);
  const sections: CargoDayReportSection[] = [];

  for (const wh of WAREHOUSE_ORDER) {
    const list = buckets[wh];
    if (!list.length) continue;
    sections.push({
      warehouse: wh,
      label: warehouseLabel[wh],
      rows: toReportRows(list, sessionYmd, customerDirectory),
    });
  }

  const hasUrgentFlightDate = sections.some((sec) =>
    sec.rows.some((r) => r.flightDateUrgent),
  );

  return {
    sessionYmd: sessionYmd.trim(),
    titleDate: formatCargoReportTitleDate(sessionYmd),
    totalLots: dayRows.length,
    hasUrgentFlightDate,
    sections,
  };
}
