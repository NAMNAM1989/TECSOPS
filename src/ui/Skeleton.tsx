import type { HTMLAttributes } from "react";

export function Skeleton({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-ui-skeleton rounded-lg bg-slate-200/90 ${className}`}
      aria-hidden
      {...rest}
    />
  );
}

/** Skeleton trang Ops / Customers / Stats khi Suspense. */
export function PageSkeleton({
  variant = "ops",
}: {
  variant?: "ops" | "customers" | "stats";
}) {
  return (
    <div
      className="mx-auto max-w-[1600px] px-3 py-3 sm:px-4 sm:py-4 lg:px-6"
      role="status"
      aria-busy="true"
      aria-label="Đang tải trang"
    >
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-ui-border pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="hidden h-5 w-24 sm:block" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 min-w-[12rem] flex-1" />
      </div>
      {variant === "customers" ? (
        <div className="grid gap-3 sm:grid-cols-[240px_1fr]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : variant === "stats" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-12 w-20" />
            <Skeleton className="h-12 w-20" />
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-12 w-28" />
            <Skeleton className="h-12 w-28" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full opacity-70" />
          <Skeleton className="h-12 w-full opacity-50" />
        </div>
      )}
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
