import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Nút icon vuông — không padding ngang */
  iconOnly?: boolean;
}

/** Nút toolbar ghost — palette dashboard, không viền cứng. */
export function DashboardToolbarButton({
  children,
  className = "",
  iconOnly,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-lg border border-slate-200/80 bg-white font-semibold text-dashboard-primary shadow-sm transition hover:border-teal-500/30 hover:bg-teal-50/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-dashboard-surface-dark dark:text-dashboard-primary-dark dark:hover:bg-ops-elevated ${
        iconOnly ? "h-8 w-8" : "gap-1.5 px-3 py-1.5 text-[11px]"
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
