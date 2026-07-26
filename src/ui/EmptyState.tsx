import type { ReactNode } from "react";
import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ui-border bg-ui-surface px-4 py-10 text-center">
      <p className="text-sm font-bold text-ui-text">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-[13px] text-ui-text-muted">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button className="mt-4" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "Có lỗi xảy ra",
  description,
  children,
  onRetry,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center">
      <p className="text-sm font-bold text-red-950">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-[13px] text-red-900/80">{description}</p> : null}
      {children}
      {onRetry ? (
        <Button className="mt-4" size="sm" variant="danger" onClick={onRetry}>
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}
