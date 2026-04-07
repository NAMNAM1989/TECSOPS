export type ShipmentStatus =
  | "PENDING"      // Chờ hàng / chưa có thông tin
  | "RECEIVED"     // Đã nhận hàng tại kho
  | "AT_RISK"      // Sắp trễ cutoff (< 2h)
  | "CUTOFF_PASSED"// Đã quá cutoff
  | "BUILT_UP"     // Đã đóng kiện
  | "DEPARTED"     // Đã bay
  | "DELIVERED";   // Đã giao

export type Warehouse = "TECS-TCS" | "TECS-SCSC";

export interface Shipment {
  id: string;
  stt: number;
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

export type ShipmentField = keyof Omit<Shipment, "id" | "status" | "stt">;
