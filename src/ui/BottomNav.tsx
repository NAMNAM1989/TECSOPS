import type { AppRoute } from "../hooks/useHashRoute";

type Props = {
  active: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onPrefetchCustomers?: () => void;
  onPrefetchStats?: () => void;
};

const ITEMS: {
  id: AppRoute;
  label: string;
  icon: string;
}[] = [
  { id: "ops", label: "Ops", icon: "▣" },
  { id: "customers", label: "Khách", icon: "◎" },
  { id: "stats", label: "Thống kê", icon: "▤" },
];

/** Thanh điều hướng dưới — mobile; luôn hiện Ops / Khách / Thống kê. */
export function BottomNav({
  active,
  onNavigate,
  onPrefetchCustomers,
  onPrefetchStats,
}: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[500] border-t border-ui-border/90 bg-ui-surface/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-6px_20px_rgba(11,18,32,0.07)] backdrop-blur-[8px] md:hidden"
      aria-label="Điều hướng chính"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-2">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
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
              className={`flex min-h-12 min-w-[4.5rem] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
                isActive
                  ? "bg-teal-600/12 text-teal-900 ring-1 ring-inset ring-teal-600/25"
                  : "text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
              }`}
            >
              <span
                className={`text-[15px] leading-none ${isActive ? "text-teal-700" : ""}`}
                aria-hidden
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
