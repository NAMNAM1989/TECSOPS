import { useEffect, useState, type ReactNode } from "react";
import {
  splitPersistKey,
  useSplitPane,
  type SplitDirection,
  type SplitUnit,
} from "../hooks/useSplitPane";

export type SplitBreakpoint = "md" | "lg";

type Props = {
  primary: ReactNode;
  secondary: ReactNode;
  /** id bề mặt — persist `tecsops_split:<id>:v1` */
  surfaceId: string;
  /** false = không gutter (parent tự ẩn hiện pane) */
  enabled?: boolean;
  /** md = 768px (catalog|lines); lg = 1024px (H21 main, DIM) */
  breakpoint?: SplitBreakpoint;
  direction?: SplitDirection;
  unit?: SplitUnit;
  defaultPrimary?: number;
  minPrimary?: number;
  maxPrimary?: number;
  minSecondaryPx?: number;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
  gutterClassName?: string;
};

function useMinWidthMatches(px: number) {
  const [ok, setOk] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${px}px)`).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setOk(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [px]);
  return ok;
}

/**
 * Hai pane + gutter kéo được (từ breakpoint trở lên). Persist theo surfaceId.
 */
export function SplitPane({
  primary,
  secondary,
  surfaceId,
  enabled = true,
  breakpoint = "lg",
  direction = "row",
  unit = "percent",
  defaultPrimary,
  minPrimary,
  maxPrimary,
  minSecondaryPx,
  className = "",
  primaryClassName = "",
  secondaryClassName = "",
  gutterClassName = "",
}: Props) {
  const bpPx = breakpoint === "md" ? 768 : 1024;
  const atBreakpoint = useMinWidthMatches(bpPx);
  const splitActive = enabled && atBreakpoint;

  const {
    rootRef,
    primary: primarySize,
    dragging,
    gutterProps,
  } = useSplitPane({
    enabled: splitActive,
    direction,
    unit,
    defaultPrimary,
    minPrimary,
    maxPrimary,
    minSecondaryPx,
    persistKey: splitPersistKey(surfaceId),
  });

  const isRow = direction === "row";

  const rootStyle =
    splitActive && unit === "percent" && isRow
      ? ({
          display: "grid",
          gridTemplateColumns: `minmax(0, ${primarySize}%) 6px minmax(0, 1fr)`,
        } as const)
      : splitActive && unit === "percent" && !isRow
        ? ({
            display: "grid",
            gridTemplateRows: `minmax(0, ${primarySize}%) 6px minmax(0, 1fr)`,
          } as const)
        : splitActive && unit === "px" && isRow
          ? ({
              display: "grid",
              gridTemplateColumns: `minmax(0, ${primarySize}px) 6px minmax(0, 1fr)`,
            } as const)
          : splitActive && unit === "px" && !isRow
            ? ({
                display: "grid",
                gridTemplateRows: `minmax(0, ${primarySize}px) 6px minmax(0, 1fr)`,
              } as const)
            : undefined;

  return (
    <div
      ref={rootRef}
      className={`min-h-0 min-w-0 flex-1 ${
        splitActive ? "" : "flex flex-col"
      } ${dragging ? "select-none" : ""} ${className}`}
      style={rootStyle}
      data-split-dragging={dragging ? "1" : undefined}
      data-testid={`split-pane-${surfaceId}`}
    >
      <div
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${primaryClassName}`}
        data-split-pane="primary"
      >
        {primary}
      </div>

      {splitActive ? (
        <div
          {...gutterProps}
          className={`relative z-10 touch-none ${
            isRow
              ? "cursor-col-resize bg-ui-border/70 hover:bg-indigo-400/80 active:bg-indigo-500"
              : "cursor-row-resize bg-ui-border/70 hover:bg-indigo-400/80 active:bg-indigo-500"
          } ${dragging ? "!bg-indigo-500" : ""} ${gutterClassName}`}
          data-testid={`split-gutter-${surfaceId}`}
        >
          <span
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ui-text-muted/50 ${
              isRow ? "h-8 w-1" : "h-1 w-8"
            }`}
            aria-hidden
          />
        </div>
      ) : null}

      <div
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${
          splitActive ? "" : "flex-1"
        } ${secondaryClassName}`}
        data-split-pane="secondary"
      >
        {secondary}
      </div>
    </div>
  );
}
