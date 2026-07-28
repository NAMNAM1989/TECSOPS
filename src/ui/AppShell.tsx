import type { ReactNode } from "react";

/** Khung trang tối giản — sticky chrome phẳng, không blur/glass. */
export function AppShell({
  children,
  chrome,
  maxWidthClass = "max-w-[1600px]",
}: {
  chrome: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className={`mx-auto min-w-0 ${maxWidthClass} px-2 py-1.5 sm:px-4 sm:py-3 lg:px-6`}>
      <div className="sticky top-0 z-40 -mx-2 mb-1.5 min-w-0 border-b border-ui-border bg-ui-background px-2 pb-1.5 pt-[max(0.2rem,env(safe-area-inset-top))] sm:-mx-4 sm:mb-3 sm:px-4 sm:pb-2.5 sm:pt-2.5 lg:-mx-6 lg:px-6">
        {chrome}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** KPI Lô / Kiện / Kg — nền phẳng. */
export function KpiStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex min-w-[3.5rem] flex-col items-center rounded-xl border border-ui-border bg-ui-surface px-2.5 py-1 shadow-ui-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ui-text-muted">{label}</span>
      <span className="font-mono text-sm font-bold tabular-nums leading-tight text-ui-text">{value}</span>
    </span>
  );
}
