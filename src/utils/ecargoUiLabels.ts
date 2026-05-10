import type { EcargoExtensionStatus } from "../types/ecargo";
import type { EcargoKhoScscLinePersisted } from "./ecargoRegisterLocalStorage";

const EXTENSION_LABEL: Record<EcargoExtensionStatus, string> = {
  received: "Đã nhận",
  filling: "Đang điền eCargo",
  submitted: "Đã tạo phiếu",
  waiting_verify_email: "Đang chờ mail xác thực",
  verified_waiting_qr: "Đang chờ QR",
  qr_ready: "Đã có QR",
  error: "Lỗi",
};

export function ecargoExtensionStatusLabel(status: EcargoExtensionStatus): string {
  return EXTENSION_LABEL[status];
}

/** Nhãn trạng thái ngắn dưới ô eCargo (KHO SCSC). */
export function ecargoKhoScscLineStatusLabel(line: EcargoKhoScscLinePersisted | undefined): string {
  if (!line) return "Chưa gửi";
  if (line.phase === "sending") return "Đang gửi";
  if (line.phase === "sent_local") {
    return "Đã gửi OPS — chờ extension tạo phiếu & chờ QR trên eCargo";
  }
  if (line.phase === "extension" && line.extensionStatus) {
    return ecargoExtensionStatusLabel(line.extensionStatus);
  }
  return "Chưa gửi";
}

/**
 * Dòng phụ giải thích bước tiếp theo (OPS không thể tự « tạo phiếu + QR » trên server eCargo).
 * Chỉ hiển thị khi có ngữ cảnh (đã gửi hoặc đang có phản hồi extension).
 */
export function ecargoKhoScscStatusSubline(line: EcargoKhoScscLinePersisted | undefined): string | null {
  if (!line) return null;
  if (line.phase === "sent_local") {
    return "OPS chỉ chuyển dữ liệu sang eCargo Auto. Tạo phiếu và QR do trang eCargo + extension xử lý; có mail xác thực thì thêm bước trung gian.";
  }
  if (line.phase === "extension" && line.extensionStatus) {
    switch (line.extensionStatus) {
      case "received":
      case "filling":
        return "Đang thao tác trên eCargo (điền form / tạo phiếu).";
      case "submitted":
        return "Phiếu đã tạo — chờ bước xác thực hoặc QR tùy luồng eCargo.";
      case "waiting_verify_email":
        return "Cần xác thực email trước khi tới bước QR.";
      case "verified_waiting_qr":
        return "Đang chờ hiển thị QR trên eCargo.";
      case "qr_ready":
        return "QR đã có — kiểm tra cửa sổ eCargo.";
      case "error":
        return line.extensionMessage?.trim()
          ? line.extensionMessage.trim().slice(0, 140)
          : "Lỗi từ extension — kiểm tra eCargo Auto / log.";
      default:
        return null;
    }
  }
  return null;
}
