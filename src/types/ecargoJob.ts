export type EcargoJobStatus =
  | "queued"
  | "filling"
  | "submitted"
  | "waiting_verify_email"
  | "mail_received"
  | "verifying"
  | "verified_waiting_qr"
  | "qr_ready"
  | "verified"
  | "error"
  | "superseded";

/** Job đang chạy quá lâu không cập nhật — cho phép đăng ký lại. */
export const ECARGO_STALE_JOB_MS = 3 * 60 * 1000;

export type EcargoJobRecord = {
  jobId?: string;
  /** Lần đăng ký (1 = lần đầu). */
  attempt?: number;
  supersededBy?: string;
  shipmentId: string;
  status: EcargoJobStatus;
  vehicleNo?: string;
  message?: string;
  verifyUrl?: string;
  verifyCode?: string;
  registrationNo?: string;
  qrSubject?: string;
  hasQrImage?: boolean;
  detailsUrl?: string;
  mailReceivedAt?: string;
  verifyClickedAt?: string;
  qrReceivedAt?: string;
  /** Thời gian từng pha (ms) để debug tốc độ. */
  stageMs?: {
    playwright?: number;
    verifyMail?: number;
    verify?: number;
    qrWait?: number;
  };
  updatedAt?: string;
  createdAt?: string;
  finishedAt?: string;
  durationMs?: number;
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
      return "Đang đọc mail Gmail…";
    case "mail_received":
      return "Đã nhận email xác thực";
    case "verifying":
      return "Đang bấm Xác Thực…";
    case "verified_waiting_qr":
      return "Đã xác thực — chờ email QR";
    case "qr_ready":
      return "Hoàn tất — đã có mã QR";
    case "verified":
      return "Hoàn tất — đã tạo phiếu và xác thực";
    case "error":
      return "Lỗi";
    case "superseded":
      return "";
    default:
      return "";
  }
}

/** Cho phép gửi lệnh đăng ký mới (kể cả khi lần trước lỗi hoặc đã xong). */
export function canRetryEcargoJob(job?: EcargoJobRecord): boolean {
  if (!job?.status) return true;
  if (job.status === "error" || job.status === "superseded") return true;
  if (isEcargoJobTerminal(job.status)) return true;
  if (isEcargoJobRunning(job.status)) {
    const t = Date.parse(job.updatedAt || job.createdAt || "");
    if (!Number.isFinite(t)) return true;
    return Date.now() - t >= ECARGO_STALE_JOB_MS;
  }
  return true;
}

export function isEcargoJobRunning(status: EcargoJobStatus | undefined): boolean {
  return (
    status === "queued" ||
    status === "filling" ||
    status === "submitted" ||
    status === "waiting_verify_email" ||
    status === "mail_received" ||
    status === "verifying" ||
    status === "verified_waiting_qr"
  );
}

export function isEcargoJobTerminal(status: EcargoJobStatus | undefined): boolean {
  return status === "qr_ready" || status === "verified" || status === "error";
}
