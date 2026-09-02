import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AppRoute } from "../hooks/useHashRoute";
import type { Shipment } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { listOpsCargoReportActions } from "../components/opsCargoReportItems";

export type MobileCargoCopyApi = {
  viewRows: readonly Shipment[];
  copying: boolean;
  onCopy: (kind: CargoDayReportCopyKind) => void;
};

type Props = {
  active: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onPrefetchCustomers?: () => void;
  onPrefetchStats?: () => void;
  onPrefetchAirlines?: () => void;
  /** Ops mobile — copy ảnh báo cáo trong cùng menu nav. */
  cargoCopy?: MobileCargoCopyApi | null;
  /** Test-only: mở menu ngay khi render. */
  defaultOpen?: boolean;
};

function IconOps({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconCustomers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5M14 20c0-2 1.5-3.5 4-3.5" />
    </svg>
  );
}

function IconStats({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M4 19V5M4 19h16M8 15v-4M12 15V9M16 15v-2" />
    </svg>
  );
}

function IconAirline({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M7 7h.01M3 11l8.5 8.5a2 2 0 002.828 0l6.172-6.172a2 2 0 000-2.828L12.5 2.5 3 11z" />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconImage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5.5-5.5L7 19" />
    </svg>
  );
}

const ITEMS: {
  id: AppRoute;
  label: string;
  Icon: typeof IconOps;
}[] = [
  { id: "ops", label: "Ops", Icon: IconOps },
  { id: "customers", label: "Khách", Icon: IconCustomers },
  { id: "airlines", label: "Hãng", Icon: IconAirline },
  { id: "stats", label: "TK", Icon: IconStats },
];

/**
 * Nav mobile — nút FAB góc trái; mở menu: copy ảnh (trên) + điều hướng.
 * Ẩn khi `html[data-ops-mobile-overlay=sheet]`.
 */
export function BottomNav({
  active,
  onNavigate,
  onPrefetchCustomers,
  onPrefetchStats,
  onPrefetchAirlines,
  cargoCopy = null,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const ActiveIcon = ITEMS.find((i) => i.id === active)?.Icon ?? IconMenu;

  const reportActions = useMemo(
    () =>
      cargoCopy
        ? listOpsCargoReportActions({
            viewRows: cargoCopy.viewRows,
            copying: cargoCopy.copying,
          })
        : [],
    [cargoCopy],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target;
      if (t instanceof Node && rootRef.current && !rootRef.current.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  const prefetch = (id: AppRoute) => {
    if (id === "customers") onPrefetchCustomers?.();
    if (id === "stats") onPrefetchStats?.();
    if (id === "airlines") onPrefetchAirlines?.();
  };

  return (
    <div
      ref={rootRef}
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-[500] md:hidden [[data-ops-mobile-overlay=sheet]_&]:pointer-events-none [[data-ops-mobile-overlay=sheet]_&]:invisible"
      data-testid="bottom-nav"
    >
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu Ops"
          className="mb-2 w-[13.5rem] overflow-hidden rounded-2xl border border-ui-border bg-ui-surface shadow-ui-lg"
        >
          {reportActions.length > 0 ? (
            <div data-testid="bottom-nav-cargo-copy" className="border-b border-ui-border/70">
              <p className="px-3 pb-1 pt-2 text-[9px] font-extrabold uppercase tracking-wide text-ui-text-muted">
                Copy ảnh
              </p>
              {reportActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  data-testid={`bottom-nav-copy-${action.id}`}
                  disabled={action.disabled}
                  title={action.description}
                  onClick={() => {
                    if (action.disabled || !cargoCopy) return;
                    cargoCopy.onCopy(action.id);
                    setOpen(false);
                  }}
                  className={`flex w-full touch-manipulation items-center gap-2.5 px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-focus disabled:cursor-not-allowed disabled:opacity-40 ${
                    action.disabled
                      ? "text-ui-text-muted"
                      : "text-ui-text hover:bg-teal-500/10"
                  }`}
                >
                  <IconImage className="h-4 w-4 shrink-0 text-ui-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold leading-tight">{action.label}</span>
                    <span className="block truncate text-[10px] font-medium text-ui-text-muted">
                      {action.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {ITEMS.map((item) => {
            const isActive = active === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                data-testid={`bottom-nav-${item.id}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  onNavigate(item.id);
                  setOpen(false);
                }}
                onMouseEnter={() => prefetch(item.id)}
                onFocus={() => prefetch(item.id)}
                className={`flex w-full touch-manipulation items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-focus ${
                  isActive
                    ? "bg-teal-500/12 text-ui-primary-hover"
                    : "text-ui-text hover:bg-ui-surface-muted"
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-ui-accent" : "text-ui-text-muted"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        data-testid="bottom-nav-toggle"
        aria-label={open ? "Đóng menu" : "Mở menu · copy ảnh & điều hướng"}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-14 min-h-14 w-14 min-w-14 touch-manipulation items-center justify-center rounded-full border border-ui-border/80 bg-ui-surface text-ui-navy shadow-ui-md transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.97]"
      >
        {open ? <IconClose className="h-6 w-6" /> : <ActiveIcon className="h-6 w-6 text-ui-accent" />}
      </button>
    </div>
  );
}
