import type { EcargoJobRecord, EcargoJobStatus } from "../types/ecargoJob";

export type EcargoProgressStepState = "pending" | "active" | "done" | "error";

export type EcargoProgressStep = {
  id: string;
  label: string;
  state: EcargoProgressStepState;
  detail?: string;
};

const STATUS_ORDER: EcargoJobStatus[] = [
  "queued",
  "filling",
  "submitted",
  "waiting_verify_email",
  "mail_received",
  "verifying",
  "verified_waiting_qr",
  "qr_ready",
  "verified",
];

function rank(status: EcargoJobStatus | undefined): number {
  if (!status) return -1;
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 ? i : -1;
}

type StepDef = {
  id: string;
  label: string;
  /** Trạng thái tối thiểu để bước này coi là xong. */
  doneAt: EcargoJobStatus;
  /** Trạng thái đang chạy trong bước này. */
  active: EcargoJobStatus[];
  detail?: (job: EcargoJobRecord) => string | undefined;
};

const STEPS: StepDef[] = [
  {
    id: "form",
    label: "Điền form & tạo phiếu trên eCargo",
    doneAt: "submitted",
    active: ["queued", "filling"],
  },
  {
    id: "verify-mail",
    label: "Đọc email xác thực (Gmail IMAP)",
    doneAt: "mail_received",
    active: ["submitted", "waiting_verify_email"],
    detail: (job) =>
      job.status === "waiting_verify_email"
        ? "Worker quét INBOX — thư có thể vẫn «chưa đọc» đến khi worker chọn đúng email SCSC."
        : job.verifyCode
          ? `Mã: ${job.verifyCode.length > 14 ? `${job.verifyCode.slice(0, 14)}…` : job.verifyCode}`
          : undefined,
  },
  {
    id: "verify-click",
    label: "Bấm Xác thực trên trang eCargo",
    doneAt: "verified",
    active: ["mail_received", "verifying"],
  },
  {
    id: "qr-mail",
    label: "Lấy mã QR (khi cần vào kho)",
    doneAt: "qr_ready",
    active: ["verified_waiting_qr"],
    detail: (job) =>
      job.status === "verified"
        ? "Bấm «Lấy mã QR» trên dòng lô hoặc trong modal khi đến cổng kho."
        : undefined,
  },
];

function stepState(job: EcargoJobRecord | undefined, def: StepDef): EcargoProgressStepState {
  const s = job?.status;
  if (!s) return "pending";
  if (s === "qr_ready") return "done";
  if (s === "verified_waiting_qr" && def.id === "verify-click") return "done";
  if (s === "verified") {
    if (def.id === "qr-mail") return "pending";
    return rank(s) >= rank(def.doneAt) ? "done" : def.active.includes(s) ? "active" : "pending";
  }
  if (s === "error") {
    const failedRank = failedStepRankOnError(job);
    const myRank = STEPS.findIndex((d) => d.id === def.id);
    if (myRank < failedRank) return "done";
    if (myRank === failedRank) return "error";
    return "pending";
  }
  const r = rank(s);
  if (r >= rank(def.doneAt)) return "done";
  if (def.active.includes(s)) return "active";
  if (r > rank(def.active[0]!) && r < rank(def.doneAt)) return "active";
  return "pending";
}

/** Ước lượng bước lỗi khi status = error (dựa trên dữ liệu job đã có). */
function failedStepRankOnError(job?: EcargoJobRecord): number {
  if (!job) return 0;
  if (job.verifyClickedAt || job.stageMs?.verify != null) return 3;
  if (job.verifyCode || job.mailReceivedAt || job.stageMs?.verifyMail != null) return 2;
  if (job.registrationNo || job.stageMs?.playwright != null) return 1;
  return 0;
}

/** Bốn bước hiển thị cho người dùng theo trạng thái job eCargo. */
export function ecargoProgressSteps(job?: EcargoJobRecord): EcargoProgressStep[] {
  return STEPS.map((def) => ({
    id: def.id,
    label: def.label,
    state: stepState(job, def),
    detail: job && def.detail ? def.detail(job) : undefined,
  }));
}
