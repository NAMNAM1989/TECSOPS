import type { ReactNode } from "react";

export type BannerTone = "info" | "success" | "warning" | "danger";

const TONE: Record<BannerTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-950",
};

export function Banner({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13px] ${TONE[tone]} ${className}`}
    >
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold leading-snug">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5 text-[12px] opacity-90" : ""}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function InlineError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 text-[12px] font-medium text-ui-danger">
      {children}
    </p>
  );
}
