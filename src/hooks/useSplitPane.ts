import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type SplitDirection = "row" | "column";
export type SplitUnit = "percent" | "px";

export type SplitPanePersisted = {
  primary: number;
  unit: SplitUnit;
};

const STORAGE_PREFIX = "tecsops_split:";

export function splitPersistKey(surfaceId: string, version = "v1"): string {
  return `${STORAGE_PREFIX}${surfaceId}:${version}`;
}

function readPersisted(key: string | undefined): SplitPanePersisted | null {
  if (!key || typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SplitPanePersisted;
    if (typeof parsed?.primary !== "number" || !Number.isFinite(parsed.primary)) return null;
    if (parsed.unit !== "percent" && parsed.unit !== "px") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(key: string | undefined, value: SplitPanePersisted) {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota
  }
}

/**
 * Clamp primary size. Với percent: min/max là %; với px: min/max là px.
 * Nếu có containerSize + minSecondaryPx → không để secondary nhỏ hơn ngưỡng.
 */
export function clampSplitPrimary(
  value: number,
  opts: {
    min: number;
    max: number;
    unit: SplitUnit;
    containerSize?: number;
    minSecondaryPx?: number;
  }
): number {
  let v = value;
  if (!Number.isFinite(v)) v = opts.min;
  let min = opts.min;
  let max = opts.max;
  const container = opts.containerSize ?? 0;
  const minSec = opts.minSecondaryPx ?? 0;
  if (container > 0 && minSec > 0) {
    if (opts.unit === "percent") {
      const maxBySecondary = ((container - minSec) / container) * 100;
      max = Math.min(max, maxBySecondary);
    } else {
      max = Math.min(max, container - minSec);
    }
  }
  if (max < min) return Math.round((min + max) / 2);
  return Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000;
}

/** Tính primary từ vị trí pointer trong root. */
export function primaryFromPointer(
  clientPos: number,
  rootStart: number,
  rootSize: number,
  unit: SplitUnit
): number {
  if (!(rootSize > 0)) return unit === "percent" ? 50 : 0;
  const offset = clientPos - rootStart;
  if (unit === "percent") {
    return (offset / rootSize) * 100;
  }
  return offset;
}

type DragSession = {
  pointerId: number;
};

/**
 * Split 2 pane trong container — % hoặc px primary; persist localStorage.
 * Khác useDraggablePanel (floating window): hệ quy chiếu là root split, không phải viewport.
 */
export function useSplitPane(opts: {
  enabled?: boolean;
  direction?: SplitDirection;
  unit?: SplitUnit;
  defaultPrimary?: number;
  minPrimary?: number;
  maxPrimary?: number;
  /** Secondary tối thiểu (px) — tính theo container lúc kéo. */
  minSecondaryPx?: number;
  persistKey?: string;
}) {
  const enabled = opts.enabled ?? true;
  const direction = opts.direction ?? "row";
  const unit = opts.unit ?? "percent";
  const defaultPrimary = opts.defaultPrimary ?? (unit === "percent" ? 50 : 360);
  const minPrimary = opts.minPrimary ?? (unit === "percent" ? 28 : 240);
  const maxPrimary = opts.maxPrimary ?? (unit === "percent" ? 72 : 720);
  const minSecondaryPx = opts.minSecondaryPx ?? (unit === "percent" ? 280 : 280);
  const persistKey = opts.persistKey;

  const persisted = useRef(readPersisted(persistKey)).current;
  const initial =
    persisted && persisted.unit === unit
      ? clampSplitPrimary(persisted.primary, {
          min: minPrimary,
          max: maxPrimary,
          unit,
        })
      : defaultPrimary;

  const [primary, setPrimary] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

  const persistNow = useCallback(
    (next: number) => {
      writePersisted(persistKey, { primary: next, unit });
    },
    [persistKey, unit]
  );

  const applyPrimary = useCallback(
    (raw: number, containerSize: number) => {
      const next = clampSplitPrimary(raw, {
        min: minPrimary,
        max: maxPrimary,
        unit,
        containerSize,
        minSecondaryPx,
      });
      setPrimary(next);
      return next;
    },
    [maxPrimary, minPrimary, minSecondaryPx, unit]
  );

  const resetPrimary = useCallback(() => {
    const root = rootRef.current;
    const size =
      direction === "row" ? root?.getBoundingClientRect().width ?? 0 : root?.getBoundingClientRect().height ?? 0;
    const next = applyPrimary(defaultPrimary, size);
    persistNow(next);
  }, [applyPrimary, defaultPrimary, direction, persistNow]);

  const onGutterPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      sessionRef.current = { pointerId: e.pointerId };
      setDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [enabled]
  );

  const onGutterPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const raw =
        direction === "row"
          ? primaryFromPointer(e.clientX, rect.left, rect.width, unit)
          : primaryFromPointer(e.clientY, rect.top, rect.height, unit);
      const containerSize = direction === "row" ? rect.width : rect.height;
      applyPrimary(raw, containerSize);
    },
    [applyPrimary, direction, unit]
  );

  const endGutterDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      sessionRef.current = null;
      setDragging(false);
      persistNow(primaryRef.current);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [persistNow]
  );

  const onGutterDoubleClick = useCallback(() => {
    if (!enabled) return;
    resetPrimary();
  }, [enabled, resetPrimary]);

  const onGutterKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      const step = unit === "percent" ? 2 : 24;
      let delta = 0;
      if (direction === "row") {
        if (e.key === "ArrowLeft") delta = -step;
        if (e.key === "ArrowRight") delta = step;
      } else {
        if (e.key === "ArrowUp") delta = -step;
        if (e.key === "ArrowDown") delta = step;
      }
      if (!delta) return;
      e.preventDefault();
      const root = rootRef.current;
      const size =
        direction === "row"
          ? root?.getBoundingClientRect().width ?? 0
          : root?.getBoundingClientRect().height ?? 0;
      const next = applyPrimary(primaryRef.current + delta, size);
      persistNow(next);
    },
    [applyPrimary, direction, enabled, persistNow, unit]
  );

  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = direction === "row" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = prevSelect;
    };
  }, [direction, dragging]);

  const gutterProps = {
    role: "separator" as const,
    tabIndex: enabled ? 0 : -1,
    "aria-orientation": (direction === "row" ? "vertical" : "horizontal") as
      | "vertical"
      | "horizontal",
    "aria-valuenow": Math.round(primary),
    "aria-valuemin": Math.round(minPrimary),
    "aria-valuemax": Math.round(maxPrimary),
    title: "Kéo để đổi tỉ lệ panel · double-click để reset",
    onPointerDown: onGutterPointerDown,
    onPointerMove: onGutterPointerMove,
    onPointerUp: endGutterDrag,
    onPointerCancel: endGutterDrag,
    onDoubleClick: onGutterDoubleClick,
    onKeyDown: onGutterKeyDown,
  };

  return {
    rootRef,
    primary,
    unit,
    direction,
    dragging,
    enabled,
    resetPrimary,
    gutterProps,
    setPrimary: (raw: number) => {
      const root = rootRef.current;
      const size =
        direction === "row"
          ? root?.getBoundingClientRect().width ?? 0
          : root?.getBoundingClientRect().height ?? 0;
      const next = applyPrimary(raw, size);
      persistNow(next);
    },
  };
}
