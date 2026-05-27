import type { EcargoJobRecord } from "../types/ecargoJob";
import { isEcargoJobRunning, isEcargoJobTerminal } from "../types/ecargoJob";
import {
  describeEcargoRowNotification,
  ecargoRowCompactLabel,
} from "../utils/ecargoUiLabels";

type Props = {
  job?: EcargoJobRecord;
  awb?: string;
  /** Lưới / ô thao tác: chỉ nhãn ngắn, chi tiết trong tooltip. */
  compact?: boolean;
  className?: string;
};

/** Trạng thái eCargo một dòng — `compact` dùng cho cột thao tác desktop. */
export function EcargoRowNotice({ job, awb, compact = false, className = "" }: Props) {
  if (!job?.status) return null;

  const full = describeEcargoRowNotification(job);
  const running = isEcargoJobRunning(job.status);
  const terminal = isEcargoJobTerminal(job.status);

  if (!running && !terminal) return null;

  const display = compact
    ? ecargoRowCompactLabel(job)
    : [full.title, full.detail].filter(Boolean).join(" · ");

  const title = [
    full.title,
    full.detail,
    awb && terminal ? `AWB ${awb}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const tone =
    job.status === "verified" || job.status === "qr_ready"
      ? "text-emerald-700 dark:text-emerald-300"
      : job.status === "error"
        ? "text-red-700 dark:text-red-300"
        : job.status === "mail_received"
          ? "text-violet-800 dark:text-violet-300"
          : "text-sky-800 dark:text-sky-300";

  return (
    <p
      role="status"
      aria-live="polite"
      title={title}
      className={`max-w-full truncate font-semibold leading-none ${tone} ${
        compact ? "text-[8px] tracking-tight" : "text-[10px] leading-tight"
      } ${className}`}
    >
      {display}
    </p>
  );
}
