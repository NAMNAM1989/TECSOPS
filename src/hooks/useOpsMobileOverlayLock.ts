import { useEffect, useState } from "react";

const ATTR = "data-ops-mobile-overlay";

/**
 * Khóa chrome mobile (BottomNav / FAB) khi sheet/modal mở —
 * tránh che Lưu/Hủy và nút trên sheet.
 */
export function useOpsMobileOverlayLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const root = document.documentElement;
    const prev = root.getAttribute(ATTR);
    root.setAttribute(ATTR, "sheet");
    return () => {
      if (prev == null) root.removeAttribute(ATTR);
      else root.setAttribute(ATTR, prev);
    };
  }, [locked]);
}

/** Bottom inset từ visualViewport (bàn phím iOS/Android). */
export function useVisualViewportBottomInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const layoutH = window.innerHeight;
      const visibleBottom = vv.height + vv.offsetTop;
      setInset(Math.max(0, layoutH - visibleBottom));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return inset;
}
