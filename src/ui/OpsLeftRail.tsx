import type { AppRoute } from "../hooks/useHashRoute";

type Props = {
  active: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onPrefetchCustomers?: () => void;
  onPrefetchStats?: () => void;
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

const ITEMS: {
  id: AppRoute;
  label: string;
  Icon: typeof IconOps;
}[] = [
  { id: "ops", label: "Ops", Icon: IconOps },
  { id: "customers", label: "Khách", Icon: IconCustomers },
  { id: "stats", label: "Thống kê", Icon: IconStats },
];

/** Rail trái desktop — polish v4 Operational Signal. */
export function OpsLeftRail({
  active,
  onNavigate,
  onPrefetchCustomers,
  onPrefetchStats,
}: Props) {
  return (
    <aside
      className="hidden w-[72px] shrink-0 flex-col items-center gap-2 border-r border-ui-border bg-ui-surface px-2 py-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] md:flex"
      aria-label="Điều hướng chính"
      data-testid="ops-left-rail"
    >
      <div
        className="grid h-12 w-12 place-items-center rounded-xl bg-ui-navy text-center text-[10px] font-bold leading-tight tracking-wide text-white shadow-[inset_0_-2px_0_#0D9488]"
        title="AirCargo_OPS"
        data-testid="brand-mark"
      >
        AC
        <br />
        OPS
      </div>
      <nav className="mt-3 flex w-full flex-col gap-1">
        {ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`nav-${id}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate(id)}
              onMouseEnter={() => {
                if (id === "customers") onPrefetchCustomers?.();
                if (id === "stats") onPrefetchStats?.();
              }}
              onFocus={() => {
                if (id === "customers") onPrefetchCustomers?.();
                if (id === "stats") onPrefetchStats?.();
              }}
              className={`relative flex min-h-11 w-full touch-manipulation flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
                isActive
                  ? "bg-teal-500/12 text-ui-primary-hover"
                  : "text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
              }`}
            >
              {isActive ? (
                <span
                  className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-sm bg-ui-accent"
                  aria-hidden
                />
              ) : null}
              <Icon className="h-5 w-5 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
