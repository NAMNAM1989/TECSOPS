import { useEffect } from "react";
import type { EcargoToastItem } from "../hooks/useEcargoKhoScscRegister";

type Props = {
  items: readonly EcargoToastItem[];
  onDismiss: (id: string) => void;
  onAction?: (item: EcargoToastItem) => void;
};

export function EcargoToastStack({ items, onDismiss, onAction }: Props) {
  useEffect(() => {
    if (!items.length) return;
    const timers = items.map((t) =>
      window.setTimeout(() => onDismiss(t.id), t.tone === "error" ? 12_000 : 8_000)
    );
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [items, onDismiss]);

  if (!items.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-24 left-3 right-3 z-[200] flex flex-col gap-2 md:bottom-6 md:left-auto md:right-4 md:w-[min(22rem,92vw)]"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-md ${
            t.tone === "success"
              ? "border-emerald-500/40 bg-emerald-50/95 text-emerald-950 dark:bg-emerald-950/90 dark:text-emerald-50"
              : t.tone === "error"
                ? "border-red-500/40 bg-red-50/95 text-red-950 dark:bg-red-950/90 dark:text-red-50"
                : "border-sky-500/40 bg-white/95 text-sky-950 dark:bg-slate-900/95 dark:text-sky-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-[11px] leading-snug opacity-90">{t.body}</p> : null}
              {t.actionLabel && onAction ? (
                <button
                  type="button"
                  onClick={() => onAction(t)}
                  className="mt-1.5 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-emerald-700"
                >
                  {t.actionLabel}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 rounded-full px-1.5 text-[11px] font-semibold opacity-60 hover:opacity-100"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
