import type { DimDivisor, DimPieceLine } from "../utils/volumetricDim";

/** Trạng thái nghiệp vụ — 3 bước đầu bám AWB / kiện / DIM, sau đó NV chọn thủ công. */
export type ShipmentStatus =
  | "PENDING" // BOOKING (đủ AWB, chưa kiện hoặc chưa đủ AWB)
  | "RECEIVED" // ĐÃ NHẬN HÀNG (đủ AWB + số kiện)
  | "VOLUME_DONE" // ĐÃ ĐO VOLUME (đã có DIM)
  | "CUSTOMS" // HẢI QUAN
  | "SECURITY" // AN NINH
  | "OLA_PULL" // KÉO OLA
  | "WEIGH_SLIP" // NỘP TỜ CÂN
  | "COMPLETED"; // HOÀN THÀNH

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
