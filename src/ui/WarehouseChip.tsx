import type { Warehouse } from "../types/shipment";
import { opsTeamOf, warehouseFamily, warehouseLabel } from "../constants/warehouses";
import { warehouseTone } from "../styles/warehouseTokens";

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
  const tone = warehouseTone[warehouse];

  const isTecsHub = team === "TECS";
  const sizeClasses =
    size === "sm" ? "h-[22px] px-1.5 text-2xs gap-1" : "h-7 px-2.5 text-xs gap-1.5";

  const containerClasses = [
    "inline-flex items-center rounded border border-l-[3px] font-sans font-semibold transition-colors select-none",
    sizeClasses,
    tone.surface,
    tone.text,
    tone.border,
    tone.bar,
    active ? "ring-2 ring-ui-focus ring-offset-1 shadow-ui-sm" : "",
    Component === "button"
      ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const fullLabel = warehouseLabel[warehouse];

  const chipContent = (
    <>
      <span className="sr-only">{team} {fullLabel}</span>
      <span aria-hidden="true" className="inline-flex items-center">
        {isTecsHub ? (
          <span className="flex items-center tracking-tight">
            <span>TECS</span>
            <span className="mx-0.5 opacity-60">│</span>
            <span>{family}</span>
          </span>
        ) : (
          <span>{warehouse}</span>
        )}

        {typeof count === "number" ? (
          <span className="ml-1 font-mono text-2xs font-semibold tabular-nums">
            {countPrefix ? `${countPrefix}${count}` : count}
          </span>
        ) : null}
      </span>
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
