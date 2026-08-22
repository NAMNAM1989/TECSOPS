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
    <div className={`mx-auto min-w-0 ${maxWidthClass} px-3 py-1.5 sm:px-3 sm:py-1.5 lg:px-4`}>
      <div className="sticky top-0 z-40 -mx-3 mb-1.5 min-w-0 border-b border-ui-border bg-ui-background px-3 pb-1.5 pt-[max(0.25rem,env(safe-area-inset-top))] sm:-mx-3 sm:mb-1.5 sm:px-3 sm:pb-1.5 sm:pt-1 lg:-mx-4 lg:px-4">
        {chrome}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** KPI Lô / Kiện / Kg — nền phẳng, gọn. */
export function KpiStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex min-w-[3.25rem] flex-col items-center rounded-xl border border-ui-border bg-ui-surface px-2.5 py-1 shadow-ui-sm">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-ui-text-muted">{label}</span>
      <span className="font-mono text-[13px] font-bold tabular-nums leading-tight text-ui-text">{value}</span>
    </span>
  );
}
