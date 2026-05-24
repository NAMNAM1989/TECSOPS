import type { EcargoKhoScscLinePersisted } from "./ecargoKhoScscCore";
import type { EcargoJobRecord } from "../types/ecargoJob";
import { ecargoJobStatusLabel } from "../types/ecargoJob";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";

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
