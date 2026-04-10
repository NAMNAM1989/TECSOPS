import type { DimDivisor, DimPieceLine } from "../utils/volumetricDim";

export type ShipmentStatus =
  | "PENDING"       // BOOKING
  | "RECEIVED"      // Đã nhận hàng tại kho
  | "AT_RISK"       // Sắp trễ cutoff (< 2h)
  | "CUTOFF_PASSED" // Hàng gấp (quá cutoff)
  | "BUILT_UP"      // Đã xong
  | "DEPARTED"      // Đã kéo OLA
  | "DELIVERED";    // Hoàn thành

export type Warehouse = "TECS-TCS" | "TECS-SCSC";

export type { DimPieceLine };

export interface Shipment {
  id: string;
  stt: number;
  /** Ngày phiên bảng (YYYY-MM-DD, theo giờ local khi nhập) */
  sessionDate: string;
  awb: string;
  flight: string;
  flightDate: string;  // "05APR" etc.
  cutoff: string;      // ISO hoặc "" nếu chưa có
  cutoffNote: string;  // Ghi chú thêm (VD "PER")
  /** Ghi chú tự do cho lô (form booking) */
  note: string;
  dest: string;
  warehouse: Warehouse;
  pcs: number | null;
  kg: number | null;
  /** Dimensional weight (kg) — trọng lượng thể tích */
  dimWeightKg: number | null;
  /** Chi tiết từng nhóm kiện (D×R×C×số kiện), null nếu chỉ nhập kg tay */
  dimLines: DimPieceLine[] | null;
  /** Hệ số dùng khi tính từ dimLines (để mở lại modal khớp cách tính) */
  dimDivisor: DimDivisor | null;
  customer: string;
  status: ShipmentStatus;
}

export type ShipmentField = keyof Omit<Shipment, "id" | "status" | "stt" | "sessionDate">;
