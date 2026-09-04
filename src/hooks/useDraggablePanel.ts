import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type DragOffset = { x: number; y: number };
export type PanelSize = { width: number; height: number };

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type ResizeSession = {
  pointerId: number;
  edge: ResizeEdge;
  startX: number;
  startY: number;
  originW: number;
  originH: number;
  originOffsetX: number;
  originOffsetY: number;
};

export type ResizeEdge = "e" | "s" | "se" | "w" | "n" | "ne" | "sw" | "nw";

const DEFAULT_MARGIN = 24;
const NUDGE_STEP = 16;
const MIN_W = 420;
const MIN_H = 360;

type PersistedLayout = {
  offset: DragOffset;
  size?: PanelSize;
};

function readPersisted(key: string | undefined): PersistedLayout | null {
  if (!key || typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLayout;
    if (!parsed?.offset || typeof parsed.offset.x !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(key: string | undefined, layout: PersistedLayout) {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    // ignore quota
  }
}

export function clampPanelOffset(
  next: DragOffset,
  opts: {
    panelWidth: number;
    panelHeight: number;
    offset: DragOffset;
    rectLeft: number;
    rectTop: number;
    viewportW: number;
    viewportH: number;
    marginPx: number;
  },
): DragOffset {
  const {
    panelWidth,
    panelHeight: _panelHeight,
    offset,
    rectLeft,
    rectTop,
    viewportW,
    viewportH,
    marginPx,
  } = opts;
  void _panelHeight;
  const untranslatedLeft = rectLeft - offset.x;
  const untranslatedTop = rectTop - offset.y;
  const maxX = viewportW - marginPx - untranslatedLeft;
  const minX = marginPx - untranslatedLeft - panelWidth + Math.min(panelWidth, 120);
  const maxY = viewportH - marginPx - untranslatedTop;
  const minY = marginPx - untranslatedTop;
  return {
    x: Math.min(maxX, Math.max(minX, next.x)),
    y: Math.min(maxY, Math.max(minY, next.y)),
  };
}

/** Kéo + resize panel desktop; persist offset/size; hỗ trợ nudge. */
export function useDraggablePanel(opts?: {
  enabled?: boolean;
  marginPx?: number;
  /** localStorage key — persist offset (+ size nếu có resize). */
  persistKey?: string;
  /** Cho phép kéo cạnh/góc đổi kích thước. */
  resizable?: boolean;
  defaultSize?: PanelSize;
}) {
  const enabled = opts?.enabled ?? true;
  const marginPx = opts?.marginPx ?? DEFAULT_MARGIN;
  const persistKey = opts?.persistKey;
  const resizable = opts?.resizable ?? false;

  const persisted = useRef(readPersisted(persistKey)).current;

  const [offset, setOffset] = useState<DragOffset>(
    () => persisted?.offset ?? { x: 0, y: 0 },
  );
  const [size, setSize] = useState<PanelSize | null>(
    () => persisted?.size ?? opts?.defaultSize ?? null,
  );
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const resizeRef = useRef<ResizeSession | null>(null);
  const offsetRef = useRef(offset);
  const sizeRef = useRef(size);
  offsetRef.current = offset;
  sizeRef.current = size;

  const persistNow = useCallback(
    (nextOffset: DragOffset, nextSize: PanelSize | null) => {
      writePersisted(persistKey, {
        offset: nextOffset,
        ...(nextSize ? { size: nextSize } : {}),
      });
    },
    [persistKey],
  );

  const viewportSize = useCallback(() => {
    if (typeof window === "undefined") return { w: 1280, h: 720 };
    // visualViewport phủ multi-monitor / zoom trình duyệt tốt hơn inner*
    const vv = window.visualViewport;
    return {
      w: Math.round(vv?.width ?? window.innerWidth),
      h: Math.round(vv?.height ?? window.innerHeight),
    };
  }, []);

  const clampOffset = useCallback(
    (next: DragOffset, nextSize?: PanelSize | null): DragOffset => {
      const el = panelRef.current;
      if (!el || typeof window === "undefined") return next;
      const rect = el.getBoundingClientRect();
      const vp = viewportSize();
      const w = nextSize?.width ?? sizeRef.current?.width ?? rect.width;
      const h = nextSize?.height ?? sizeRef.current?.height ?? rect.height;
      return clampPanelOffset(next, {
        panelWidth: w,
        panelHeight: h,
        offset: offsetRef.current,
        rectLeft: rect.left,
        rectTop: rect.top,
        viewportW: vp.w,
        viewportH: vp.h,
        marginPx,
      });
    },
    [marginPx, viewportSize],
  );

  const resetOffset = useCallback(() => {
    setOffset({ x: 0, y: 0 });
    persistNow({ x: 0, y: 0 }, sizeRef.current);
  }, [persistNow]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!enabled) return;
      setOffset((prev) => {
        const next = clampOffset({ x: prev.x + dx, y: prev.y + dy });
        persistNow(next, sizeRef.current);
        return next;
      });
    },
    [clampOffset, enabled, persistNow],
  );

  const nudgeByKey = useCallback(
    (key: string, step = NUDGE_STEP) => {
      if (key === "ArrowLeft") nudge(-step, 0);
      else if (key === "ArrowRight") nudge(step, 0);
      else if (key === "ArrowUp") nudge(0, -step);
      else if (key === "ArrowDown") nudge(0, step);
    },
    [nudge],
  );

  // Re-clamp khi đổi kích thước cửa sổ / visualViewport (multi-monitor move)
  useEffect(() => {
    if (!enabled) return;
    const reclamp = () => {
      setOffset((prev) => clampOffset(prev));
    };
    window.addEventListener("resize", reclamp);
    window.visualViewport?.addEventListener("resize", reclamp);
    window.visualViewport?.addEventListener("scroll", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.visualViewport?.removeEventListener("resize", reclamp);
      window.visualViewport?.removeEventListener("scroll", reclamp);
    };
  }, [clampOffset, enabled]);

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, label, [data-no-drag], [data-resize-edge]")) {
        return;
      }
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      sessionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
      };
      setDragging(true);
    },
    [enabled],
  );

  const onHandlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      const next = clampOffset({
        x: session.originX + (e.clientX - session.startX),
        y: session.originY + (e.clientY - session.startY),
      });
      setOffset(next);
    },
    [clampOffset],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      sessionRef.current = null;
      setDragging(false);
      persistNow(offsetRef.current, sizeRef.current);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [persistNow],
  );

  const onHandleDoubleClick = useCallback(() => {
    if (!enabled) return;
    resetOffset();
  }, [enabled, resetOffset]);

  const onResizePointerDown = useCallback(
    (edge: ResizeEdge) => (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !resizable) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      resizeRef.current = {
        pointerId: e.pointerId,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        originW: sizeRef.current?.width ?? rect.width,
        originH: sizeRef.current?.height ?? rect.height,
        originOffsetX: offsetRef.current.x,
        originOffsetY: offsetRef.current.y,
      };
      setResizing(true);
    },
    [enabled, resizable],
  );

  const onResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = resizeRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      let w = session.originW;
      let h = session.originH;
      let ox = session.originOffsetX;
      let oy = session.originOffsetY;
      const edge = session.edge;

      if (edge.includes("e")) w = session.originW + dx;
      if (edge.includes("s")) h = session.originH + dy;
      if (edge.includes("w")) {
        w = session.originW - dx;
        ox = session.originOffsetX + dx;
      }
      if (edge.includes("n")) {
        h = session.originH - dy;
        oy = session.originOffsetY + dy;
      }

      const vp = viewportSize();
      w = Math.max(MIN_W, Math.min(w, vp.w - marginPx * 2));
      h = Math.max(MIN_H, Math.min(h, vp.h - marginPx * 2));

      const nextSize = { width: Math.round(w), height: Math.round(h) };
      const nextOffset = clampOffset({ x: ox, y: oy }, nextSize);
      setSize(nextSize);
      setOffset(nextOffset);
    },
    [clampOffset, marginPx, viewportSize],
  );

  const endResize = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = resizeRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      resizeRef.current = null;
      setResizing(false);
      persistNow(offsetRef.current, sizeRef.current);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [persistNow],
  );

  const resizeHandleProps = useCallback(
    (edge: ResizeEdge) => ({
      "data-resize-edge": edge,
      onPointerDown: onResizePointerDown(edge),
      onPointerMove: onResizePointerMove,
      onPointerUp: endResize,
      onPointerCancel: endResize,
    }),
    [endResize, onResizePointerDown, onResizePointerMove],
  );

  return {
    panelRef,
    offset,
    size,
    dragging,
    resizing,
    resetOffset,
    nudge,
    nudgeByKey,
    handleProps: {
      onPointerDown: onHandlePointerDown,
      onPointerMove: onHandlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick: onHandleDoubleClick,
    },
    resizeHandleProps,
    resizable: enabled && resizable,
  };
}
