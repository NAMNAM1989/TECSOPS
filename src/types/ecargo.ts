import type { Shipment } from "./shipment";

/** Payload gửi qua `CustomEvent("ECARGO_REGISTER_FROM_OPS")` cho Chrome Extension. */
export type EcargoRegisterFromOpsMessage = {
  type: "ECARGO_REGISTER_FROM_OPS";
  payload: EcargoRegisterPayloadBody;
};

export type EcargoRegisterPayloadBody = {
  vehicleNo: string;
  mawb: string;
  hawb: string;
  flight: string;
  flightDate: string;
  destination: string;
  pcs: number;
  grossWeight: number;
  commodity: string;
  shc: string;
  source: "ops";
  warehouse: "SCSC";
  opsShipmentId: string;
  customerName: string;
};

/** Trạng thái phản hồi từ extension (event `ECARGO_REGISTER_STATUS`). */
export type EcargoExtensionStatus =
  | "received"
  | "filling"
  | "submitted"
  | "waiting_verify_email"
  | "verified_waiting_qr"
  | "qr_ready"
  | "error";

export type EcargoRegisterStatusDetail = {
  opsShipmentId: string;
  vehicleNo: string;
  status: EcargoExtensionStatus;
  message?: string;
};

export type EcargoRegisterBuildInput = {
  row: Shipment;
  vehicleNormalized: string;
  /** Ngày đang xem trên OPS (YYYY-MM-DD) — dùng năm khi parse ngày bay dạng `11MAY`. */
  viewSessionYmd: string;
};
