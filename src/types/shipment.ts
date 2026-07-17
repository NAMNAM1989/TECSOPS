import type { DimDivisor, DimPieceLine } from "../utils/volumetricDim";

/** Trạng thái nghiệp vụ — 3 bước đầu bám AWB / kiện / DIM, sau đó NV chọn thủ công. */
export type ShipmentStatus =
  | "PENDING" // BOOKING (đủ AWB, chưa kiện hoặc chưa đủ AWB)
  | "RECEIVED" // ĐÃ NHẬN HÀNG (đủ AWB + số kiện)
  | "VOLUME_DONE" // ĐÃ ĐO VOLUME (đã có DIM)
  | "CUSTOMS" // HẢI QUAN
  | "SECURITY" // AN NINH
  | "OLA_PULL" // KÉO OLA
  | "RECEPTION_COMPLETED" // HOÀN THÀNH TIẾP NHẬN
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
  /** HAWB (House) — tùy chọn; dùng cho tem nhãn & phiếu cân khi có. */
  hawb?: string;
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
  /** Mã khách hàng (danh bạ) — có thể rỗng với dữ liệu cũ */
  customerCode: string;
  /** Khóa ngoại khách hàng (database) */
  customerId?: string;
  /** Shipper lưu sẵn trong danh bạ khách. */
  customerShipperId?: string;
  /** CNEE lưu sẵn trong danh bạ khách (customer_saved_consignees / savedConsignees). */
  customerConsigneeId?: string;
  /** Agent chung (danh mục toàn cục: Agent A / B / không có). */
  globalAgentId?: string;
  /** @deprecated Dùng `globalAgentId`. */
  customerAgentId?: string;
  /** Tên hàng lưu sẵn trong danh bạ khách. */
  customerGoodsId?: string;
  /** Tên hàng in phiếu cân (ưu tiên hơn note / mục lưu sẵn nếu đã nhập). */
  goodsDescriptionPrint?: string;
  /** Yêu cầu khác in phiếu cân — ưu tiên hơn danh bạ khách nếu đã nhập trên lô. */
  otherRequirementsPrint?: string;
  /**
   * Dữ liệu shipper dùng riêng cho in phiếu cân.
   * Nếu rỗng, hệ thống sẽ fallback theo customer/customerCode + danh bạ.
   */
  shipperNamePrint?: string;
  shipperAddressPrint?: string;
  shipperPhonePrint?: string;
  shipperEmailPrint?: string;
  taxCodePrint?: string;
  agentNamePrint?: string;
  agentAddressPrint?: string;
  agentPhonePrint?: string;
  agentEmailPrint?: string;
  agentTaxCodePrint?: string;
  consigneeNamePrint?: string;
  consigneeAddressPrint?: string;
  consigneePhonePrint?: string;
  consigneeEmailPrint?: string;
  notifyNamePrint?: string;
  status: ShipmentStatus;
}

export type ShipmentField = keyof Omit<Shipment, "id" | "status" | "stt" | "sessionDate">;
