import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { A4_HEIGHT_MM, A4_WIDTH_MM } from "../../utils/printMmUnits";

const MM_TO_PX = 96 / 25.4;
export const A4_PAGE_W_PX = A4_WIDTH_MM * MM_TO_PX;
export const A4_PAGE_H_PX = A4_HEIGHT_MM * MM_TO_PX;

/** `actual` = 210×297 mm thật (CSS mm, scale 1). `fit` = thu nhỏ vừa panel. */
export type A4ZoomMode = "actual" | "fit";

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.5;
const ZOOM_STEP = 0.1;

/**
 * Preview A4 — mặc định cỡ giấy thật (100%), cuộn panel nếu màn hình nhỏ hơn tờ.
 */
export function useA4PreviewScale(contentKey: string) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<A4ZoomMode>("actual");
  const [manualScale, setManualScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [pageHeightPx, setPageHeightPx] = useState(A4_PAGE_H_PX);

  const recompute = useCallback(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport) return;
    const ph = Math.max(A4_PAGE_H_PX, page?.scrollHeight ?? A4_PAGE_H_PX);
    setPageHeightPx(ph);
    const cw = viewport.clientWidth - 40;
    const ch = viewport.clientHeight - 40;
    if (cw > 0 && ch > 0) {
      setFitScale(Math.min(cw / A4_PAGE_W_PX, ch / ph, 1));
    }
  }, []);

  useLayoutEffect(() => {
    recompute();
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(viewport);
    if (page) ro.observe(page);
    return () => ro.disconnect();
  }, [recompute, contentKey]);

  const scale =
    mode === "fit"
      ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale))
      : Math.min(MAX_SCALE, Math.max(MIN_SCALE, manualScale));

  const isActualSize = mode === "actual" && Math.abs(scale - 1) < 0.001;

  const zoomIn = useCallback(() => {
    setMode("actual");
    setManualScale((s) => Math.min(MAX_SCALE, Number((s + ZOOM_STEP).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setMode("actual");
    setManualScale((s) => Math.max(MIN_SCALE, Number((s - ZOOM_STEP).toFixed(2))));
  }, []);

  const setActualSize = useCallback(() => {
    setMode("actual");
    setManualScale(1);
  }, []);

  const setFitToPanel = useCallback(() => {
    setMode("fit");
    setManualScale(1);
  }, []);

  return {
    viewportRef,
    pageRef,
    scale,
    isActualSize,
    pageHeightPx,
    scaledW: A4_PAGE_W_PX * scale,
    scaledH: pageHeightPx * scale,
    zoomPercent: Math.round(scale * 100),
    mode,
    setActualSize,
    setFitToPanel,
    zoomIn,
    zoomOut,
  };
}
