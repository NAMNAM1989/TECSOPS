import type { Warehouse } from "../types/shipment";
import { opsTeamOf, warehouseFamily } from "../constants/warehouses";

export type WarehouseChipProps = {
  warehouse: Warehouse;
  count?: number;
  countPrefix?: string;
  active?: boolean;
  size?: "sm" | "md";
  as?: "span" | "button";
  onClick?: () => void;
  className?: string;
  role?: string;
  title?: string;
  "aria-selected"?: boolean;
  "data-testid"?: string;
};

export function WarehouseChip({
  warehouse,
  count,
  countPrefix,
  active = false,
  size = "md",
  as: Component = "span",
  onClick,
  className = "",
  role,
  title,
  "aria-selected": ariaSelected,
  "data-testid": testId,
}: WarehouseChipProps) {
  const team = opsTeamOf(warehouse);
  const family = warehouseFamily(warehouse);

  const isTecsHub = team === "TECS";
  const sizeClasses =
    size === "sm" ? "h-[22px] px-1.5 text-2xs gap-1" : "h-7 px-2.5 text-xs gap-1.5";

  const familyTheme =
    family === "TCS"
      ? {
          text: "text-wh-tcs",
          bar: "border-l-wh-tcs-bar",
          activeBorder: "border-sky-500 ring-1 ring-sky-500",
        }
      : {
          text: "text-wh-scsc",
          bar: "border-l-wh-scsc-bar",
          activeBorder: "border-violet-500 ring-1 ring-violet-500",
        };

  const containerClasses = [
    "inline-flex items-center rounded border border-l-[3px] font-sans font-bold transition-colors select-none",
    sizeClasses,
    familyTheme.bar,
    active
      ? `bg-ui-surface ${familyTheme.activeBorder} shadow-ui-sm`
      : "bg-ui-surface-muted border-ui-border text-ui-text hover:bg-ui-surface hover:border-ui-border-strong",
    Component === "button"
      ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const chipContent = (
    <>
      {isTecsHub ? (
        <span className="flex items-center tracking-tight">
          <span className="text-wh-tecs">TECS</span>
          <span className="mx-0.5 text-slate-300 dark:text-slate-600">│</span>
          <span className={familyTheme.text}>{family}</span>
        </span>
      ) : (
        <span className={familyTheme.text}>{warehouse}</span>
      )}

      {typeof count === "number" ? (
        <span
          className={`ml-1 font-mono text-2xs tabular-nums ${
            active ? "font-bold text-ui-text" : "font-semibold text-ui-text-muted"
          }`}
        >
          {countPrefix ? `${countPrefix}${count}` : count}
        </span>
      ) : null}
    </>
  );

  if (Component === "button") {
    return (
      <button
        type="button"
        onClick={onClick}
        role={role}
        aria-selected={ariaSelected}
        data-testid={testId}
        title={title}
        className={containerClasses}
      >
        {chipContent}
      </button>
    );
  }

  return (
    <span
      role={role}
      aria-selected={ariaSelected}
      data-testid={testId}
      title={title}
      className={containerClasses}
    >
      {chipContent}
    </span>
  );
}
