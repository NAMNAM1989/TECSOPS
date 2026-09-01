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
  { id: "stats", label: "TK", Icon: IconStats },
];

/**
 * Thanh điều hướng dưới — 52px + Safari safe-area.
 * Ẩn khi `html[data-ops-mobile-overlay=sheet]` (edit sheet / modal) để không che Lưu/Hủy.
 */
export function BottomNav({
  active,
  onNavigate,
  onPrefetchCustomers,
  onPrefetchStats,
}: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[500] border-t border-ui-border bg-ui-surface pb-[max(12px,env(safe-area-inset-bottom))] pt-0 shadow-[0_-4px_16px_rgba(11,18,32,0.06)] md:hidden [[data-ops-mobile-overlay=sheet]_&]:pointer-events-none [[data-ops-mobile-overlay=sheet]_&]:invisible"
      aria-label="Điều hướng chính"
      data-testid="bottom-nav"
    >
      <div className="mx-auto flex h-[52px] max-w-lg items-stretch justify-around gap-1 px-2">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => {
                if (item.id === "customers") onPrefetchCustomers?.();
                if (item.id === "stats") onPrefetchStats?.();
              }}
              onFocus={() => {
                if (item.id === "customers") onPrefetchCustomers?.();
                if (item.id === "stats") onPrefetchStats?.();
              }}
              className={`flex min-h-11 min-w-[4.5rem] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-ui-md px-2 text-[12px] font-semibold leading-4 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
                isActive
                  ? "text-ui-primary"
                  : "text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-ui-primary" : ""}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
