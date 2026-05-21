export type EcargoJobStatus =
  | "queued"
  | "filling"
  | "submitted"
  | "waiting_verify_email"
  | "verifying"
  | "verified"
  | "error";

export type EcargoJobRecord = {
  jobId?: string;
  shipmentId: string;
  status: EcargoJobStatus;
  vehicleNo?: string;
  message?: string;
  verifyUrl?: string;
  updatedAt?: string;
  createdAt?: string;
  finishedAt?: string;
};

export function ecargoJobStatusLabel(status: EcargoJobStatus | undefined): string {
  switch (status) {
    case "queued":
      return "Đã xếp hàng — chờ worker";
    case "filling":
      return "Đang điền form eCargo…";
    case "submitted":
      return "Đã tạo phiếu — chờ email xác thực";
    case "waiting_verify_email":
      return "Đang chờ email xác thực…";
    case "verifying":
      return "Đang bấm Xác Thực…";
    case "verified":
      return "Hoàn tất — đã tạo phiếu và xác thực";
    case "error":
      return "Lỗi";
    default:
      return "";
  }
}

export function isEcargoJobRunning(status: EcargoJobStatus | undefined): boolean {
  return (
    status === "queued" ||
    status === "filling" ||
    status === "submitted" ||
    status === "waiting_verify_email" ||
    status === "verifying"
  );
}
