/** Cấu hình cố định eCargo SCSC — khớp extension RAR. */
export const ECARGO_CREATE_URL =
  process.env.ECARGO_CREATE_URL?.trim() || "https://ecargo.scsc.vn/Export/VCTOrder/Create";

export const ECARGO_CONTACT_EMAIL =
  process.env.ECARGO_CONTACT_EMAIL?.trim() || "namnamlog.work@gmail.com";

export const ECARGO_GMAIL_USER =
  process.env.ECARGO_GMAIL_USER?.trim() || ECARGO_CONTACT_EMAIL;

export const FIXED_ECARGO_CONFIG = {
  agency: { name: process.env.ECARGO_AGENCY_NAME?.trim() || "NAM NAM LOGISTICS" },
  agent: {
    name: process.env.ECARGO_AGENT_NAME?.trim() || "NGUYEN DUC TIN",
    documentType: "CCCD",
    documentNo: process.env.ECARGO_AGENT_CCCD?.trim() || "086204007404",
  },
  warehouse: {
    timeRule: {
      after20h: { date: "tomorrow", timeSlot: "07:00 - 08:00" },
    },
  },
  vehicle: { type: "Ô tô" },
  driver: {
    name: process.env.ECARGO_DRIVER_NAME?.trim() || "NGUYEN DUC TIN",
    documentType: "CCCD",
    documentNo: process.env.ECARGO_DRIVER_CCCD?.trim() || "086204007404",
  },
  contact: {
    email: ECARGO_CONTACT_EMAIL,
    phone: process.env.ECARGO_CONTACT_PHONE?.trim() || "0967122041",
  },
  bookingDefaults: {
    pcs: 99,
    grossWeight: 1000,
    commodity: "Garments",
    hawb: "0",
    shc: "0",
  },
};

export const ECARGO_JOB_TIMEOUT_MS = Number(process.env.ECARGO_JOB_TIMEOUT_MS) || 20 * 60 * 1000;
/** Khoảng nghỉ giữa hai lần search IMAP khi chờ mail xác thực (ms). */
export const ECARGO_GMAIL_POLL_MS = Number(process.env.ECARGO_GMAIL_POLL_MS) || 1500;
/** Poll QR chậm hơn — chỉ dùng khi ECARGO_QR_POLL_MODE=poll. */
export const ECARGO_QR_GMAIL_POLL_MS = Number(process.env.ECARGO_QR_GMAIL_POLL_MS) || 3000;
/** Thời gian chờ tối đa mỗi lần bấm «Lấy mã QR» khi bật poll (ms). */
export const ECARGO_QR_TIMEOUT_MS = Number(process.env.ECARGO_QR_TIMEOUT_MS) || 4 * 60 * 1000;
/**
 * Luồng QR mặc định: đăng ký xong ở `verified` — **không** quét mail QR.
 * Chỉ quét khi user bấm «Lấy mã QR» (job `resumeQrOnly`).
 */
export function isEcargoQrWaitInline() {
  return false;
}
/** `single` (mặc định): mỗi lần bấm «Lấy QR» = một lần search IMAP. `poll`: lặp đến hết timeout. */
export function isEcargoQrSingleScan() {
  const mode = String(process.env.ECARGO_QR_POLL_MODE ?? "single").trim().toLowerCase();
  return mode !== "poll";
}
/** QR chỉ search INBOX — giảm tải Gmail (không quét All Mail). */
export function isEcargoQrInboxOnly() {
  if (process.env.ECARGO_QR_INBOX_ONLY === "0") return false;
  return true;
}
export const ECARGO_QUEUE_KEY = process.env.ECARGO_QUEUE_KEY || "ecargo:queue";
export const ECARGO_JOB_KEY_PREFIX = process.env.ECARGO_JOB_KEY_PREFIX || "ecargo:job:";
