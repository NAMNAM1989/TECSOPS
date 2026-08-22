import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { registerNotifySink } from "./notify";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastInput = {
  title?: string;
  message: string;
  tone?: ToastTone;
  /** ms — mặc định 4200; 0 = không tự đóng */
  durationMs?: number;
};

type ToastItem = ToastInput & { id: string; tone: ToastTone };

type ToastApi = {
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_CLS: Record<ToastTone, string> = {
  info: "border-sky-200 bg-white text-sky-950",
  success: "border-emerald-200 bg-white text-emerald-950",
  warning: "border-amber-200 bg-white text-amber-950",
  danger: "border-red-200 bg-white text-red-950",
};

const DOT: Record<ToastTone, string> = {
  info: "bg-ui-info",
  success: "bg-ui-success",
  warning: "bg-ui-warning",
  danger: "bg-ui-danger",
};

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = `toast-${++seq}`;
      const tone = input.tone ?? "info";
      const durationMs = input.durationMs ?? 4200;
      setItems((prev) => [...prev.slice(-4), { ...input, id, tone }]);
      if (durationMs > 0) {
        const t = setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, t);
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      success: (message, title) => push({ message, title, tone: "success" }),
      error: (message, title) => push({ message, title, tone: "danger", durationMs: 6400 }),
      info: (message, title) => push({ message, title, tone: "info" }),
      warning: (message, title) => push({ message, title, tone: "warning", durationMs: 5600 }),
    }),
    [push, dismiss]
  );

  useEffect(() => {
    registerNotifySink((input) => {
      push({
        message: input.message,
        title: input.title,
        tone: input.tone ?? "info",
      });
    });
    return () => registerNotifySink(null);
  }, [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[600] flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-end sm:px-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-md animate-ui-toast-in items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-ui-sm ${TONE_CLS[t.tone]}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[t.tone]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              {t.title ? <p className="text-[12px] font-bold leading-snug">{t.title}</p> : null}
              <p className={`text-[13px] leading-snug ${t.title ? "mt-0.5 opacity-90" : "font-medium"}`}>
                {t.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold text-ui-text-muted hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
              aria-label="Đóng thông báo"
            >
              Đóng
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast phải dùng trong ToastProvider");
  }
  return ctx;
}
