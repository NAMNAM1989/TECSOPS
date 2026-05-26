import type { EcargoJobRecord } from "../types/ecargoJob";
import { ecargoProgressSteps, type EcargoProgressStepState } from "../utils/ecargoProgressSteps";

type Props = {
  job?: EcargoJobRecord;
  compact?: boolean;
  className?: string;
};

function dotClass(state: EcargoProgressStepState): string {
  switch (state) {
    case "done":
      return "bg-emerald-500 ring-emerald-500/30";
    case "active":
      return "bg-sky-500 ring-sky-500/40 animate-pulse";
    case "error":
      return "bg-red-500 ring-red-500/30";
    default:
      return "bg-black/15 ring-black/10 dark:bg-white/20 dark:ring-white/15";
  }
}

export function EcargoProgressChecklist({ job, compact = false, className = "" }: Props) {
  if (!job?.status || job.status === "superseded") return null;

  const steps = ecargoProgressSteps(job);
  const show = steps.some((s) => s.state !== "pending");
  if (!show) return null;

  return (
    <ol
      className={`space-y-1.5 ${compact ? "text-[10px]" : "text-[11px]"} ${className}`}
      aria-label="Tiến trình đăng ký eCargo"
    >
      {steps.map((step) => (
        <li key={step.id} className="flex gap-2 leading-snug">
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ring-2 ${dotClass(step.state)}`}
            aria-hidden
          />
          <span className={step.state === "pending" ? "opacity-50" : "font-medium"}>
            {step.label}
            {step.detail ? (
              <span className="mt-0.5 block font-normal opacity-80">{step.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
