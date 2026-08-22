import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-slate-500/10 text-slate-700 ring-slate-500/15",
  primary: "bg-teal-500/12 text-teal-900 ring-teal-500/20",
  success: "bg-emerald-500/12 text-emerald-900 ring-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-950 ring-amber-500/25",
  danger: "bg-red-500/12 text-red-900 ring-red-500/20",
  info: "bg-sky-500/12 text-sky-900 ring-sky-500/20",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
