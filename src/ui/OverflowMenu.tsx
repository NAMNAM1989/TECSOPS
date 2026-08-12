import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export type OverflowMenuItem = {
  id: string;
  label: string;
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
  onPrefetch?: () => void;
};

type Props = {
  label?: string;
  align?: "left" | "right";
  items: OverflowMenuItem[];
  /** Nút kích hoạt tùy chỉnh */
  triggerClassName?: string;
  compact?: boolean;
  /** Icon tùy chỉnh khi compact (mặc định ⋯). */
  children?: ReactNode;
};

/** Menu ⋯ / Công cụ — đóng khi click ngoài hoặc Escape. */
export function OverflowMenu({
  label = "Công cụ",
  align = "right",
  items,
  triggerClassName = "",
  compact = false,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={label}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ||
          (compact
            ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ui-border bg-ui-surface text-ui-text shadow-ui-sm transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus touch-manipulation"
            : "inline-flex min-h-9 items-center gap-1 rounded-xl border border-ui-border bg-ui-surface px-2.5 text-[12px] font-semibold text-ui-text shadow-ui-sm transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus")
        }
      >
        {compact ? (
          children ?? (
            <span className="text-lg font-bold leading-none tracking-widest" aria-hidden>
              ⋯
            </span>
          )
        ) : (
          <>
            <span aria-hidden className="text-base font-bold leading-none">
              ⋯
            </span>
            <span>{label}</span>
          </>
        )}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-[calc(100%+4px)] z-[80] min-w-[11.5rem] overflow-hidden rounded-xl border border-ui-border bg-ui-surface py-1 shadow-apple-md ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onMouseEnter={() => item.onPrefetch?.()}
              onFocus={() => item.onPrefetch?.()}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-ui-surface-muted focus:outline-none focus-visible:bg-ui-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-[13px] font-semibold text-ui-text">{item.label}</span>
              {item.description ? (
                <span className="text-[11px] text-ui-text-muted">{item.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OverflowMenuIconButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const { label, className = "", children, ...rest } = props;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ui-border bg-ui-surface text-ui-text shadow-ui-sm transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function OverflowMenuSection({ children }: { children: ReactNode }) {
  return <div className="py-1">{children}</div>;
}
