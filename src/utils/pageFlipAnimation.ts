import {
  PAGE_FLIP_DURATION_MS,
  type ScrollMode,
  DEFAULT_SCROLL_MODE,
} from "../config/tableUx";

export const SCROLL_MODE_STORAGE_KEY = "tecsops.scrollMode";

/**
 * Đọc chế độ cuộn từ localStorage
 */
export function getStoredScrollMode(): ScrollMode {
  try {
    const val = localStorage.getItem(SCROLL_MODE_STORAGE_KEY);
    if (val === "normal" || val === "page-flip") return val;
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_SCROLL_MODE;
}

/**
 * Lưu chế độ cuộn vào localStorage
 */
export function setStoredScrollMode(mode: ScrollMode): void {
  try {
    localStorage.setItem(SCROLL_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Solver cho cubic-bezier(x1, y1, x2, y2)
 * Mặc định cho lật trang: cubic-bezier(.2,.8,.2,1)
 */
export function createCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleCurveX(t: number): number {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t: number): number {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleCurveDerivativeX(t: number): number {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  function solveCurveX(x: number, epsilon = 1e-6): number {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xEst = sampleCurveX(t) - x;
      if (Math.abs(xEst) < epsilon) return t;
      const dX = sampleCurveDerivativeX(t);
      if (Math.abs(dX) < 1e-6) break;
      t -= xEst / dX;
    }
    let t0 = 0;
    let t1 = 1;
    t = x;
    while (t0 < t1) {
      const xEst = sampleCurveX(t);
      if (Math.abs(xEst - x) < epsilon) return t;
      if (x > xEst) t0 = t;
      else t1 = t;
      t = (t1 + t0) / 2;
    }
    return t;
  }

  return function (x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleCurveY(solveCurveX(x));
  };
}

export const pageFlipEase = createCubicBezier(0.2, 0.8, 0.2, 1);

const activeAnimations = new WeakMap<HTMLElement, { cancel: () => void }>();

/**
 * Kiểm tra xem người dùng có bật chế độ giảm chuyển động (prefers-reduced-motion) không
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Cuộn mượt phần tử với cubic-bezier easing và rAF
 */
export function smoothScrollTop(
  element: HTMLElement,
  targetScrollTop: number,
  duration = PAGE_FLIP_DURATION_MS
): Promise<void> {
  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
  const clampedTarget = Math.max(0, Math.min(targetScrollTop, maxScroll));

  // Hủy animation đang chạy nếu có
  const existing = activeAnimations.get(element);
  if (existing) {
    existing.cancel();
    activeAnimations.delete(element);
  }

  if (isReducedMotionPreferred() || duration <= 0) {
    element.scrollTop = clampedTarget;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const startScrollTop = element.scrollTop;
    const distance = clampedTarget - startScrollTop;
    if (Math.abs(distance) < 1) {
      element.scrollTop = clampedTarget;
      resolve();
      return;
    }

    let rafId = 0;
    let startTime = 0;

    const cancel = () => {
      if (rafId) cancelAnimationFrame(rafId);
      resolve();
    };

    activeAnimations.set(element, { cancel });

    const step = (time: number) => {
      if (!startTime) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = pageFlipEase(progress);

      element.scrollTop = startScrollTop + distance * eased;

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        element.scrollTop = clampedTarget;
        activeAnimations.delete(element);
        resolve();
      }
    };

    rafId = requestAnimationFrame(step);
  });
}

/**
 * Tính toán vị trí cuộn cho PageDown / PageUp
 * Đảm bảo dòng đầu trang mới thẳng hàng dưới mép header sticky.
 */
export function calculatePageFlipTarget(
  container: HTMLElement,
  direction: "down" | "up",
  headerHeight = 40
): number {
  const currentScrollTop = container.scrollTop;
  const clientHeight = container.clientHeight;
  const maxScroll = Math.max(0, container.scrollHeight - clientHeight);
  const usableHeight = Math.max(100, clientHeight - headerHeight);

  // Tìm tất cả các dòng <tr> trong tbody
  const rows = Array.from(
    container.querySelectorAll("tbody tr")
  ) as HTMLElement[];

  if (rows.length === 0) {
    const delta = direction === "down" ? usableHeight : -usableHeight;
    return Math.max(0, Math.min(currentScrollTop + delta, maxScroll));
  }

  const containerRect = container.getBoundingClientRect();
  const targetY = containerRect.top + headerHeight;

  if (direction === "down") {
    // Tìm dòng đầu tiên đang nằm dưới màn hình hiện tại
    const targetBottom = containerRect.top + clientHeight;
    const nextRow = rows.find((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top >= targetBottom - 10;
    });

    if (nextRow) {
      const rowOffsetInContainer = nextRow.offsetTop;
      return Math.max(0, rowOffsetInContainer - headerHeight);
    }
    // Nếu không còn dòng nào dưới màn hình, cuộn kịch xuống dưới
    return Math.max(0, container.scrollHeight - clientHeight);
  } else {
    // PageUp: tìm dòng lùi về trước 1 màn hình
    const targetPrevTop = targetY - usableHeight;
    const prevRow = rows
      .slice()
      .reverse()
      .find((r) => {
        const rect = r.getBoundingClientRect();
        return rect.top <= targetPrevTop + 10;
      });

    if (prevRow) {
      const rowOffsetInContainer = prevRow.offsetTop;
      return Math.max(0, rowOffsetInContainer - headerHeight);
    }
    return 0;
  }
}
