import type { EcargoJobRecord } from "../types/ecargoJob";
import { isEcargoJobRunning, isEcargoJobTerminal } from "../types/ecargoJob";
import { describeEcargoRowNotification } from "../utils/ecargoUiLabels";
import { EcargoProgressChecklist } from "./EcargoProgressChecklist";

type Props = {
  job?: EcargoJobRecord;
  awb?: string;
  compact?: boolean;
  className?: string;
};

export function EcargoRowNotice({ job, awb, compact = false, className = "" }: Props) {
  if (!job?.status) return null;

  const desc = describeEcargoRowNotification(job);
  const running = isEcargoJobRunning(job.status);
  const terminal = isEcargoJobTerminal(job.status);

  if (!running && !terminal) return null;

  const tone =
    job.status === "verified" || job.status === "qr_ready"
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100"
      : job.status === "error"
        ? "border-red-500/35 bg-red-500/10 text-red-900 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-100"
        : job.status === "mail_received"
          ? "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-100"
          : "border-sky-500/30 bg-sky-500/8 text-sky-950 dark:border-sky-400/25 dark:bg-sky-500/12 dark:text-sky-100";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border px-2 py-1.5 ${tone} ${compact ? "text-[10px] leading-snug" : "text-[11px] leading-snug"} ${className}`}
    >
      <p className="font-semibold">{desc.title}</p>
      {desc.detail ? <p className={`mt-0.5 font-medium opacity-90 ${compact ? "line-clamp-2" : ""}`}>{desc.detail}</p> : null}
      {running ? <EcargoProgressChecklist job={job} compact className="mt-1.5" /> : null}
      {awb && terminal ? (
        <p className="mt-0.5 font-mono text-[10px] opacity-75">AWB {awb}</p>
      ) : null}
    </div>
  );
}
