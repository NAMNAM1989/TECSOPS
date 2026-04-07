export type ShipmentStatus =
  | "PENDING"       // BOOKING
  | "RECEIVED"      // Đã nhận hàng tại kho
  | "AT_RISK"       // Sắp trễ cutoff (< 2h)
  | "CUTOFF_PASSED" // Hàng gấp (quá cutoff)
  | "BUILT_UP"      // Đã xong
  | "DEPARTED"      // Đã kéo OLA
  | "DELIVERED";    // Hoàn thành

export type Warehouse = "TECS-TCS" | "TECS-SCSC";

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
  dest: string;
  warehouse: Warehouse;
  pcs: number | null;
  kg: number | null;
  customer: string;
  status: ShipmentStatus;
}

export type ShipmentField = keyof Omit<Shipment, "id" | "status" | "stt" | "sessionDate">;
