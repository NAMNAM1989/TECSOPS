import type { Shipment } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";
import { findAwbDigitsConflict } from "./awbUnique";
import { isCargoReportFlightDateUrgent } from "./cargoDayReport";

export type AttentionSeverity = "high" | "medium" | "info";

export type AttentionFlagId =
  | "awb_incomplete"
  | "pcs_missing"
  | "pcs_zero"
  | "awb_duplicate"
  | "flight_missing"
  | "dest_missing"
  | "fly_today"
  | "flight_format"
  | "cutoff";

export type AttentionFlag = {
  id: AttentionFlagId;
  severity: AttentionSeverity;
  label: string;
  detail?: string;
};

export type ShipmentAttention = {
  shipmentId: string;
  flags: AttentionFlag[];
  highestSeverity: AttentionSeverity | null;
  needsAttention: boolean;
};

const FLIGHT_RE = /^([A-Z0-9]{2})(\d{1,4})([A-Z]?)$/i;

/** Chuẩn hoá nhóm số hiệu chuyến bay (ví dụ VJ081 và VJ81 cùng về VJ81). */
export function groupFlightKey(flight: string): string {
  const trimmed = flight.trim().toUpperCase();
  const m = trimmed.match(FLIGHT_RE);
  if (!m) return trimmed;
  const prefix = m[1];
  const num = Number(m[2]);
  const suffix = m[3] || "";
  return `${prefix}${num}${suffix}`;
}

/** Tính toán các cờ chú ý và cờ "Cần xử lý" cho một lô hàng. */
export function computeShipmentAttention(
  row: Shipment,
  allRows: Shipment[],
  sessionYmd?: string
): ShipmentAttention {
  const flags: AttentionFlag[] = [];
  const digits = awbDigitsKey(row.awb);

  // 1. AWB incomplete
  if (digits.length !== 11) {
    flags.push({
      id: "awb_incomplete",
      severity: "high",
      label: "AWB chưa đủ 11 số",
      detail: `Hiện có ${digits.length} số`,
    });
  } else {
    // 2. AWB duplicate
    const conflict = findAwbDigitsConflict(allRows, digits, row.id);
    if (conflict) {
      flags.push({
        id: "awb_duplicate",
        severity: "high",
        label: "Trùng số AWB",
        detail: `Trùng với lô STT ${conflict.stt || "?"} (${conflict.warehouse})`,
      });
    }
  }

  // 3. Kiện null / undefined
  if (row.pcs == null) {
    flags.push({
      id: "pcs_missing",
      severity: "high",
      label: "Chưa nhập số kiện",
    });
  } else if (row.pcs === 0) {
    // 4. Kiện = 0
    flags.push({
      id: "pcs_zero",
      severity: "high",
      label: "0 kiện",
    });
  }

  // 5. Thiếu chuyến hoặc ngày bay
  const flightTrimmed = (row.flight || "").trim();
  const flightDateTrimmed = (row.flightDate || "").trim();
  if (!flightTrimmed || !flightDateTrimmed) {
    flags.push({
      id: "flight_missing",
      severity: "medium",
      label: "Thiếu chuyến bay hoặc ngày bay",
      detail: !flightTrimmed ? "Chưa nhập số hiệu chuyến" : "Chưa nhập ngày bay",
    });
  }

  // 6. Thiếu DEST (< 3 ký tự)
  const destTrimmed = (row.dest || "").trim();
  if (!destTrimmed || destTrimmed.length < 3) {
    flags.push({
      id: "dest_missing",
      severity: "medium",
      label: "Thiếu điểm đến (DEST)",
      detail: destTrimmed ? "DEST chưa đủ 3 ký tự" : "Chưa nhập DEST",
    });
  }

  // 7. Bay hôm nay
  if (sessionYmd && isCargoReportFlightDateUrgent(row.flightDate, sessionYmd)) {
    flags.push({
      id: "fly_today",
      severity: "info",
      label: "Bay hôm nay",
    });
  }

  // 8. Cutoff
  if (row.cutoff && row.cutoff.trim()) {
    flags.push({
      id: "cutoff",
      severity: "info",
      label: `Cutoff ${row.cutoff}${row.cutoffNote ? ` · ${row.cutoffNote}` : ""}`,
    });
  }

  // 9. Flight format (ví dụ VJ81 vs VJ081 trong cùng tập allRows)
  if (flightTrimmed) {
    const gKey = groupFlightKey(flightTrimmed);
    const hasDifferentFormat = allRows.some((other) => {
      if (other.id === row.id) return false;
      const otherFlight = (other.flight || "").trim().toUpperCase();
      if (!otherFlight) return false;
      return groupFlightKey(otherFlight) === gKey && otherFlight !== flightTrimmed.toUpperCase();
    });
    if (hasDifferentFormat) {
      flags.push({
        id: "flight_format",
        severity: "info",
        label: "Định dạng số hiệu chuyến khác nhau",
      });
    }
  }

  let highestSeverity: AttentionSeverity | null = null;
  if (flags.some((f) => f.severity === "high")) {
    highestSeverity = "high";
  } else if (flags.some((f) => f.severity === "medium")) {
    highestSeverity = "medium";
  } else if (flags.some((f) => f.severity === "info")) {
    highestSeverity = "info";
  }

  const needsAttention = flags.some((f) => f.severity === "high" || f.severity === "medium");

  return {
    shipmentId: row.id,
    flags,
    highestSeverity,
    needsAttention,
  };
}

/** Kiểm tra nhanh lô hàng có cờ cần xử lý (mức cao hoặc trung bình) hay không. */
export function isAttentionRow(
  row: Shipment,
  allRows: Shipment[],
  sessionYmd?: string
): boolean {
  return computeShipmentAttention(row, allRows, sessionYmd).needsAttention;
}

/** Đếm số lô cần xử lý trong danh sách. */
export function countAttentionRows(
  rows: Shipment[],
  allRows: Shipment[],
  sessionYmd?: string
): number {
  return rows.filter((r) => isAttentionRow(r, allRows, sessionYmd)).length;
}

/**
 * Tính attention một lần cho toàn bộ danh sách rows, trả về Map<shipmentId, ShipmentAttention>.
 * O(N) tính toán, O(1) tra cứu cho các component con.
 */
export function computeAllShipmentsAttention(
  rows: readonly Shipment[],
  allRows: readonly Shipment[],
  sessionYmd?: string
): Map<string, ShipmentAttention> {
  const map = new Map<string, ShipmentAttention>();
  const allRowsArr = allRows as Shipment[];
  for (const row of rows) {
    map.set(row.id, computeShipmentAttention(row, allRowsArr, sessionYmd));
  }
  return map;
}
