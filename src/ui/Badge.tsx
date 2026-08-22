import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-300/70",
  primary: "bg-teal-50 text-teal-900 ring-teal-300/60",
  success: "bg-emerald-50 text-emerald-900 ring-emerald-300/60",
  warning: "bg-amber-50 text-amber-950 ring-amber-300/70",
  danger: "bg-red-50 text-red-900 ring-red-300/60",
  info: "bg-sky-50 text-sky-900 ring-sky-300/60",
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
