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
export const ECARGO_QUEUE_KEY = process.env.ECARGO_QUEUE_KEY || "ecargo:queue";
export const ECARGO_JOB_KEY_PREFIX = process.env.ECARGO_JOB_KEY_PREFIX || "ecargo:job:";
