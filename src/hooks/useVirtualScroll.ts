import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { VIRTUALIZE_THRESHOLD } from "../config/tableUx";

export interface UseVirtualScrollOptions {
  count: number;
  estimateSize?: number;
  overscan?: number;
  enabled?: boolean;
  getScrollElement: () => HTMLElement | null;
  storageKey?: string;
}

export interface VirtualItem {
  index: number;
  start: number;
  size: number;
  end: number;
}

export interface VirtualScrollResult {
  isVirtualized: boolean;
  virtualItems: VirtualItem[];
  totalSize: number;
  paddingTop: number;
  paddingBottom: number;
  startIndex: number;
  endIndex: number;
  scrollToIndex: (
    index: number,
    options?: { align?: "start" | "center" | "end" | "auto" }
  ) => void;
}

/**
 * Hook ảo hoá danh sách (Virtual Scroll) chuyên dụng cho bảng dữ liệu lớn.
 * Tự động kích hoạt khi số dòng > VIRTUALIZE_THRESHOLD (mặc định 100).
 * Chiều cao dòng ~56px, overscan 8 dòng, giữ nguyên thead sticky và cột sticky.
 * Hỗ trợ khôi phục vị trí cuộn qua sessionStorage.
 */
export function useVirtualScroll({
  count,
  estimateSize = 56,
  overscan = 8,
  enabled,
  getScrollElement,
  storageKey,
}: UseVirtualScrollOptions): VirtualScrollResult {
  const isVirtualized = enabled !== undefined ? enabled : count > VIRTUALIZE_THRESHOLD;

  const [scrollState, setScrollState] = useState<{
    scrollTop: number;
    clientHeight: number;
  }>({
    scrollTop: 0,
    clientHeight: 600,
  });

  const scrollElementRef = useRef<HTMLElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Khôi phục vị trí cuộn từ sessionStorage khi mount
  useLayoutEffect(() => {
    const el = getScrollElement();
    scrollElementRef.current = el;
    if (!el) return;

    let restoredScrollTop = 0;
    if (storageKey) {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved !== null) {
          const parsed = parseFloat(saved);
          if (!Number.isNaN(parsed) && parsed >= 0) {
            restoredScrollTop = parsed;
            el.scrollTop = parsed;
          }
        }
      } catch {
        // Bỏ qua lỗi sessionStorage (quota, privacy)
      }
    }

    setScrollState({
      scrollTop: el.scrollTop || restoredScrollTop,
      clientHeight: el.clientHeight || 600,
    });
  }, [getScrollElement, storageKey]);

  // Lắng nghe sự kiện cuộn
  useEffect(() => {
    const el = getScrollElement();
    scrollElementRef.current = el;
    if (!el || !isVirtualized) return;

    const handleScroll = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        const currentTop = el.scrollTop;
        const currentHeight = el.clientHeight || 600;

        setScrollState((prev) => {
          if (
            Math.abs(prev.scrollTop - currentTop) < 2 &&
            prev.clientHeight === currentHeight
          ) {
            return prev;
          }
          return { scrollTop: currentTop, clientHeight: currentHeight };
        });

        if (storageKey) {
          try {
            sessionStorage.setItem(storageKey, String(currentTop));
          } catch {
            // Không chặn khi lưu session thất bại
          }
        }
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [getScrollElement, isVirtualized, storageKey]);

  const scrollToIndex = useCallback(
    (
      index: number,
      options: { align?: "start" | "center" | "end" | "auto" } = {}
    ) => {
      const el = getScrollElement();
      if (!el) return;

      const align = options.align ?? "auto";
      const itemTop = index * estimateSize;
      const itemBottom = itemTop + estimateSize;
      const currentTop = el.scrollTop;
      const viewHeight = el.clientHeight || 600;

      let targetTop = currentTop;

      if (align === "start") {
        targetTop = itemTop;
      } else if (align === "end") {
        targetTop = Math.max(0, itemBottom - viewHeight);
      } else if (align === "center") {
        targetTop = Math.max(0, itemTop - viewHeight / 2 + estimateSize / 2);
      } else {
        // "auto"
        if (itemTop < currentTop) {
          targetTop = itemTop;
        } else if (itemBottom > currentTop + viewHeight) {
          targetTop = Math.max(0, itemBottom - viewHeight);
        }
      }

      if (Math.abs(targetTop - currentTop) > 1) {
        el.scrollTop = targetTop;
        setScrollState({
          scrollTop: targetTop,
          clientHeight: viewHeight,
        });
        if (storageKey) {
          try {
            sessionStorage.setItem(storageKey, String(targetTop));
          } catch {
            // Bỏ qua
          }
        }
      }
    },
    [estimateSize, getScrollElement, storageKey]
  );

  if (!isVirtualized || count === 0) {
    return {
      isVirtualized: false,
      virtualItems: [],
      totalSize: count * estimateSize,
      paddingTop: 0,
      paddingBottom: 0,
      startIndex: 0,
      endIndex: Math.max(0, count - 1),
      scrollToIndex,
    };
  }

  const { scrollTop, clientHeight } = scrollState;
  const rawStart = Math.floor(scrollTop / estimateSize);
  const rawEnd = Math.ceil((scrollTop + clientHeight) / estimateSize);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(count - 1, rawEnd + overscan);

  const paddingTop = startIndex * estimateSize;
  const paddingBottom = Math.max(0, (count - 1 - endIndex) * estimateSize);
  const totalSize = count * estimateSize;

  const virtualItems: VirtualItem[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    virtualItems.push({
      index: i,
      start: i * estimateSize,
      size: estimateSize,
      end: (i + 1) * estimateSize,
    });
  }

  return {
    isVirtualized: true,
    virtualItems,
    totalSize,
    paddingTop,
    paddingBottom,
    startIndex,
    endIndex,
    scrollToIndex,
  };
}
