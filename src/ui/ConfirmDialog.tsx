import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Dialog xác nhận nhẹ — thay window.confirm khi cần dirty-state UX. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Đồng ý",
  cancelLabel = "Hủy",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm animate-ui-toast-in rounded-2xl border border-ui-border bg-ui-surface p-4 shadow-ui-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="m-0 text-base font-bold text-ui-navy">
          {title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ui-text-muted">{message}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-2.5 text-[12px] font-semibold text-ui-text transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
          >
            {cancelLabel}
          </button>
          <Button variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
