import { WAREHOUSE_ORDER, warehouseLabel } from "../constants/warehouses";
import type { Shipment, Warehouse } from "../types/shipment";
import {
  cutoffIsoToDateDdMon,
  cutoffIsoToTimeInputText,
  formatCutoffDisplayFromLocalParts,
  splitIsoToLocalDateTime,
  ymdToDdMon,
} from "./bookingDateParse";
import { filterShipmentsBySessionYmd } from "./filterShipmentsBySessionYmd";
import { partitionShipmentsByWarehouse } from "./partitionShipmentsByWarehouse";

export type CargoDayReportRow = {
  stt: number;
  /** AWB — cột Booking */
  booking: string;
  flightDate: string;
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

function toReportRows(rows: Shipment[]): CargoDayReportRow[] {
  return sortDayLots(rows).map((s, i) => ({
    stt: i + 1,
    booking: formatCargoReportBooking(s),
    flightDate: formatCargoReportFlightDate(s),
    cutoff: formatCargoReportCutoff(s),
    dest: (s.dest ?? "").trim() || "—",
  }));
}

/**
 * Báo cáo hàng hóa hiện trường theo ngày phiên Ops.
 * Mọi lô trong ngày; ẩn kho không có lô; Booking = AWB.
 */
export function buildCargoDayReport(
  rows: readonly Shipment[],
  sessionYmd: string,
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
      rows: toReportRows(list),
    });
  }

  return {
    sessionYmd: sessionYmd.trim(),
    titleDate: formatCargoReportTitleDate(sessionYmd),
    totalLots: dayRows.length,
    sections,
  };
}
