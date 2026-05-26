import type { EcargoKhoScscLinePersisted } from "./ecargoKhoScscCore";
import type { EcargoJobRecord } from "../types/ecargoJob";
import { ecargoJobStatusLabel } from "../types/ecargoJob";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";
import { formatEcargoJobErrorMessage } from "./formatEcargoJobErrorMessage";

/** Nhãn trạng thái ngắn dưới nút eCargo (KHO SCSC). */
export function ecargoKhoScscLineStatusLabel(
  line: EcargoKhoScscLinePersisted | undefined,
  job?: EcargoJobRecord
): string {
  if (job?.status) {
    const jl = ecargoJobStatusLabel(job.status);
    if (jl) return jl;
  }
  if (line?.markedSubmitted) return "Đã hoàn tất eCargo";
  if (line?.vehicleInput?.trim()) {
    const driver = line.driverName?.trim();
    return driver
      ? `Xe ${line.vehicleInput.trim()} · ${driver} — bấm eCargo để đăng ký`
      : "Đã lưu số xe — bấm eCargo để tự động đăng ký";
  }
  return "Chưa nhập số xe";
}

export function ecargoKhoScscSaveStatusLabel(status: EcargoSaveStatus): string | null {
  switch (status) {
    case "pending":
      return "Đang gõ…";
    case "saving":
      return "Đang lưu lên Ops…";
    case "saved":
      return "Đã lưu — mọi máy đều thấy";
    case "error":
      return "Lưu thất bại — thử lại";
    default:
      return null;
  }
}

export function ecargoKhoScscStatusSubline(job?: EcargoJobRecord): string | null {
  if (job?.message) return job.message;
  if (job?.status === "verified") return "Phiếu đã tạo và xác thực xong.";
  return null;
}

/** Thông báo hiển thị ngay trên thẻ/cột lô khi job eCargo đổi trạng thái. */
export function describeEcargoRowNotification(job: EcargoJobRecord): {
  title: string;
  detail: string | null;
} {
  const code = job.verifyCode?.trim();
  const reg = job.registrationNo?.trim();
  const totalSec = job.durationMs && job.durationMs > 0 ? Math.round(job.durationMs / 1000) : null;
  const speed =
    totalSec != null
      ? `(${totalSec}s)`
      : job.stageMs
        ? [
            job.stageMs.playwright != null ? `pw ${Math.round(job.stageMs.playwright / 1000)}s` : "",
            job.stageMs.verifyMail != null
              ? `mail ${Math.round(job.stageMs.verifyMail / 1000)}s`
              : "",
            job.stageMs.verify != null ? `click ${Math.round(job.stageMs.verify / 1000)}s` : "",
            job.stageMs.qrWait != null ? `qr ${Math.round(job.stageMs.qrWait / 1000)}s` : "",
          ]
            .filter(Boolean)
            .join(" · ") || null
        : null;

  switch (job.status) {
    case "waiting_verify_email":
      return {
        title: "Đang tìm email xác thực khớp lô này…",
        detail: job.message ?? "Đọc Gmail và lọc theo MAWB/xe của lô.",
      };
    case "submitted":
      return {
        title: "Đã gửi phiếu — chờ email SCSC",
        detail: job.message ?? "Chưa bấm Xác Thực — đang chờ mail «Mã xác thực…».",
      };
    case "mail_received":
      return {
        title: "Đã đọc email xác thực",
        detail:
          [code && `Mã ${code}`, reg && `Phiếu ${reg}`, job.message].filter(Boolean).join(" · ") || null,
      };
    case "verifying":
      return {
        title: "Đang bấm Xác Thực trên eCargo…",
        detail: code ? `Mã ${code}` : job.message ?? null,
      };
    case "verified_waiting_qr":
      return {
        title: "Đã xác thực thành công",
        detail: job.message ?? "Đang chờ mail QR (Phiếu đăng ký hàng vào kho)…",
      };
    case "qr_ready":
      return {
        title: "Đã có mail QR",
        detail:
          job.message ||
          [
            reg && `Phiếu ${reg}`,
            job.qrSubject,
            job.hasQrImage ? "có ảnh QR" : "",
            speed,
          ]
            .filter(Boolean)
            .join(" · ") ||
          "Email Phiếu đăng ký hàng vào kho đã về Gmail.",
      };
    case "verified":
      return {
        title: "eCargo hoàn tất",
        detail:
          job.message ||
          [code && `Mã ${code}`, reg && `Phiếu ${reg}`, speed].filter(Boolean).join(" · ") ||
          "Đã tạo phiếu và xác thực thành công.",
      };
    case "error":
      return {
        title: "eCargo lỗi",
        detail:
          formatEcargoJobErrorMessage(job.message) ||
          "Kiểm tra lại số xe / AWB hoặc thử đăng ký lại.",
      };
    case "filling":
      return { title: "Đang điền form eCargo…", detail: null };
    case "queued":
      return { title: "Đã xếp hàng đăng ký", detail: null };
    default:
      return { title: ecargoJobStatusLabel(job.status), detail: job.message ?? null };
  }
}
