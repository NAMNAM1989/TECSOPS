import type { AppRoute } from "../hooks/useHashRoute";

type Props = {
  active: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onPrefetchCustomers?: () => void;
  onPrefetchStats?: () => void;
  onPrefetchAirlines?: () => void;
  onPrefetchScscH21?: () => void;
  onPrefetchTcsH21?: () => void;
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

/** Icon H21 — badge đặc trưng, nổi hơn outline icons khác. */
function IconH21({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="currentColor" opacity="0.16" />
      <path
        d="M8 4.75h8a1.75 1.75 0 0 1 1.75 1.75v12.2l-2.35-1.15L12 18.95l-3.4-1.4L6.25 18.7V6.5A1.75 1.75 0 0 1 8 4.75Z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M8 4.75h8a1.75 1.75 0 0 1 1.75 1.75v12.2l-2.35-1.15L12 18.95l-3.4-1.4L6.25 18.7V6.5A1.75 1.75 0 0 1 8 4.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="13.2"
        textAnchor="middle"
        fill="currentColor"
        fontSize="7.2"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="-0.04em"
      >
        H21
      </text>
    </svg>
  );
}

const ITEMS: {
  id: AppRoute;
  label: string;
  Icon: typeof IconOps;
  emphasize?: boolean;
}[] = [
  { id: "ops", label: "Ops", Icon: IconOps },
  { id: "customers", label: "Khách", Icon: IconCustomers },
  { id: "airlines", label: "Hãng", Icon: IconAirline },
  { id: "scsc-h21", label: "H21 SCSC", Icon: IconH21, emphasize: true },
  { id: "tcs-h21", label: "H21 TCS", Icon: IconH21, emphasize: true },
  { id: "stats", label: "Thống kê", Icon: IconStats },
];

/** Rail trái desktop — polish v4 Operational Signal. */
export function OpsLeftRail({
  active,
  onNavigate,
  onPrefetchCustomers,
  onPrefetchStats,
  onPrefetchAirlines,
  onPrefetchScscH21,
  onPrefetchTcsH21,
}: Props) {
  return (
    <aside
      className="hidden w-[72px] shrink-0 flex-col items-center gap-2 border-r border-ui-border bg-ui-surface px-2 py-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] md:flex"
      aria-label="Điều hướng chính"
      data-testid="ops-left-rail"
    >
      <div
        className="grid h-12 w-12 select-none place-items-center rounded-xl bg-ui-navy text-center text-[10px] font-bold leading-tight tracking-wide text-white shadow-[inset_0_-2px_0_#0D9488] transition-transform duration-300 ease-fluid hover:scale-105"
        title="AirCargo_OPS"
        data-testid="brand-mark"
      >
        AC
        <br />
        OPS
      </div>
      <nav className="mt-3 flex w-full flex-col gap-1">
        {ITEMS.map(({ id, label, Icon, emphasize }) => {
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
                if (id === "airlines") onPrefetchAirlines?.();
                if (id === "scsc-h21") onPrefetchScscH21?.();
                if (id === "tcs-h21") onPrefetchTcsH21?.();
              }}
              onFocus={() => {
                if (id === "customers") onPrefetchCustomers?.();
                if (id === "stats") onPrefetchStats?.();
                if (id === "airlines") onPrefetchAirlines?.();
                if (id === "scsc-h21") onPrefetchScscH21?.();
                if (id === "tcs-h21") onPrefetchTcsH21?.();
              }}
              className={`group btn-kinetic relative flex min-h-11 w-full select-none touch-manipulation flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
                isActive
                  ? emphasize
                    ? "bg-teal-500/18 text-teal-800 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.32)]"
                    : "bg-teal-500/12 text-ui-primary-hover shadow-sm"
                  : emphasize
                    ? "text-teal-700 hover:bg-teal-500/10 hover:text-teal-800 hover:-translate-y-0.5"
                    : "text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text hover:-translate-y-0.5"
              }`}
            >
              {isActive ? (
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full bg-ui-accent shadow-[0_0_8px_rgba(13,148,136,0.6)] transition-all duration-200 ease-fluid ${
                    emphasize ? "h-8 w-[4px]" : "h-7 w-[3.5px]"
                  }`}
                  aria-hidden
                />
              ) : null}
              <span
                className={
                  emphasize
                    ? `grid place-items-center rounded-xl transition-all duration-200 ease-fluid group-hover:scale-110 ${
                        isActive
                          ? "h-8 w-8 bg-teal-600 text-white shadow-sm shadow-teal-700/25"
                          : "h-8 w-8 bg-teal-500/15 text-teal-700 ring-1 ring-teal-500/35"
                      }`
                    : "transition-transform duration-200 ease-fluid group-hover:scale-110 group-active:scale-95"
                }
              >
                <Icon className={emphasize ? "h-[1.35rem] w-[1.35rem] shrink-0" : "h-5 w-5 shrink-0"} />
              </span>
              <span
                className={`max-w-full text-center leading-tight transition-colors duration-150 ${
                  emphasize ? "font-extrabold tracking-tight" : ""
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
