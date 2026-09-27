import type { ShipmentStatus, Warehouse } from "../types/shipment";
import { selectableStatusesForShipment, statusOrderForWarehouse } from "../utils/shipmentWorkflowStatus";
import { useUiV2 } from "../utils/featureFlags";
import {
  statusBadgeClass,
  statusDotClass,
  statusRingClass,
  statusIcon,
  statusLabel,
  statusLabelCompact,
  statusStep,
} from "./statusStyles";

export type StatusBadgeProps = {
  status: ShipmentStatus;
  warehouse?: Warehouse;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "compact";
  showStep?: boolean;
  className?: string;
  onClick?: () => void;
  "data-testid"?: string;
};

export function StatusBadge({
  status,
  warehouse,
  size = "md",
  variant = "full",
  showStep = true,
  className = "",
  onClick,
  "data-testid": testId,
}: StatusBadgeProps) {
  useUiV2();
  const label = variant === "compact" ? statusLabelCompact[status] : statusLabel[status];
  const step = warehouse && showStep ? statusStep(status, warehouse) : null;
  const stepText = step ? `${step.n}/${step.of}` : null;

  const sizeClasses = {
    sm: "h-[22px] px-2 text-2xs gap-1",
    md: "h-7 px-2.5 text-xs gap-1.5",
    lg: "h-9 px-3 text-sm gap-2",
  }[size];

  const colorClass = statusBadgeClass[status] || "bg-slate-100 text-slate-700 border-slate-300";

  const content = (
    <>
      <span aria-hidden="true" className="shrink-0 font-mono font-bold">
        {statusIcon[status]}
      </span>
      <span className="truncate font-semibold">{label}</span>
      {step ? (
        <span className="sr-only">Trạng thái: {statusLabel[status]}, bước {step.n} trên {step.of}</span>
      ) : (
        <span className="sr-only">Trạng thái: {statusLabel[status]}</span>
      )}
      {stepText ? (
        <span
          aria-hidden="true"
          className="shrink-0 font-mono text-2xs font-bold text-ui-text-muted tabular-nums"
        >
          · {stepText}
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`inline-flex max-w-full items-center justify-center rounded-full border font-sans font-bold leading-none shadow-ui-sm transition-all hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${sizeClasses} ${colorClass} ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      data-testid={testId}
      className={`inline-flex max-w-full items-center rounded-full border font-sans font-bold leading-none shadow-ui-sm ${sizeClasses} ${colorClass} ${className}`}
    >
      {content}
    </span>
  );
}

export type StatusProgressProps = {
  status: ShipmentStatus;
  warehouse: Warehouse;
  className?: string;
};

export function StatusProgress({
  status,
  warehouse,
  className = "",
}: StatusProgressProps) {
  useUiV2();
  const step = statusStep(status, warehouse);
  if (!step) return null;

  const order = statusOrderForWarehouse(warehouse);
  const dots = [];
  for (let i = 1; i <= step.of; i++) {
    const isCompleted = i < step.n;
    const isCurrent = i === step.n;
    const stepStatus = order[i - 1] ?? status;
    const dotColor = statusDotClass[stepStatus] || statusDotClass[status];
    const ringColor = statusRingClass[stepStatus] || statusRingClass[status];

    if (isCurrent) {
      dots.push(
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${dotColor} ring-2 ring-offset-1 ring-offset-ui-surface ${ringColor} transition-all`}
        />
      );
    } else if (isCompleted) {
      dots.push(
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${dotColor} transition-all`}
        />
      );
    } else {
      dots.push(
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full border border-ui-input bg-transparent dark:border-slate-400 transition-all"
        />
      );
    }
  }

  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-1 py-0.5 ${className}`}
    >
      {dots}
    </div>
  );
}

/** Pill trạng thái chỉ đọc — bọc StatusBadge để tương thích ngược. */
export function StatusPill({
  status,
  compact = false,
  className = "",
}: {
  status: ShipmentStatus;
  compact?: boolean;
  className?: string;
}) {
  return (
    <StatusBadge
      status={status}
      variant={compact ? "compact" : "full"}
      size="sm"
      className={className}
    />
  );
}

export interface StatusSelectProps {
  value: ShipmentStatus;
  onChange: (s: ShipmentStatus) => void;
  /** Kho của lô — quyết định option hợp lệ. */
  warehouse: Warehouse;
  /** Mobile — vùng chạm ≥44px. */
  compact?: boolean;
  /** Desktop bảng ngày — thấp hơn compact, nhãn vẫn ≥10px. */
  dense?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function StatusSelect({
  value,
  onChange,
  warehouse,
  compact,
  dense,
  className = "",
  "data-testid": testId,
}: StatusSelectProps) {
  useUiV2();
  const options = selectableStatusesForShipment(warehouse, value);
  const currentStep = statusStep(value, warehouse);

  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ShipmentStatus)}
      onClick={(e) => e.stopPropagation()}
      data-testid={testId}
      aria-label={`Trạng thái · ${statusLabel[value]}${currentStep ? ` (${currentStep.n}/${currentStep.of})` : ""}`}
      title={`${statusIcon[value]} ${statusLabel[value]}${currentStep ? ` (${currentStep.n}/${currentStep.of})` : ""}`}
      className={`cursor-pointer rounded-lg border font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ui-focus ${statusBadgeClass[value]} ${
        dense
          ? "h-7 w-full min-w-0 truncate px-1.5 text-2xs leading-none"
          : compact
            ? "h-11 w-full min-h-11 min-w-0 touch-manipulation truncate rounded-xl px-1.5 text-2xs leading-none shadow-ui-sm"
            : "rounded-full px-2.5 py-1 text-xs shadow-ui-sm"
      } ${className}`}
    >
      {options.map((st) => {
        const step = statusStep(st, warehouse);
        const stepHint = step ? ` (${step.n}/${step.of})` : "";
        return (
          <option key={st} value={st}>
            {statusIcon[st]} {statusLabel[st]}
            {stepHint}
          </option>
        );
      })}
    </select>
  );

  if (!compact && !dense) return select;
  return (
    <div className="w-[5.25rem] max-w-[5.25rem] shrink-0 overflow-hidden">
      {select}
    </div>
  );
}
