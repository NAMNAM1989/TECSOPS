import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculatePageFlipTarget,
  createCubicBezier,
  getStoredScrollMode,
  pageFlipEase,
  setStoredScrollMode,
  smoothScrollTop,
} from "./pageFlipAnimation";

describe("pageFlipAnimation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("cubicBezier easing", () => {
    it("thỏa mãn điều kiện biên 0 và 1, và tăng đơn điệu", () => {
      expect(pageFlipEase(0)).toBe(0);
      expect(pageFlipEase(1)).toBe(1);

      const mid = pageFlipEase(0.5);
      expect(mid).toBeGreaterThan(0.5); // easing .2, .8, .2, 1 tăng nhanh lúc đầu
      expect(mid).toBeLessThan(1);

      // Tăng đơn điệu
      let prev = 0;
      for (let i = 1; i <= 10; i++) {
        const val = pageFlipEase(i / 10);
        expect(val).toBeGreaterThanOrEqual(prev);
        prev = val;
      }
    });

    it("tạo cubic-bezier tùy biến chính xác", () => {
      const linear = createCubicBezier(0, 0, 1, 1);
      expect(linear(0)).toBe(0);
      expect(linear(1)).toBe(1);
      expect(linear(0.5)).toBeCloseTo(0.5, 2);
    });
  });

  describe("scrollMode storage", () => {
    it("mặc định trả về normal khi chưa lưu", () => {
      expect(getStoredScrollMode()).toBe("normal");
    });

    it("lưu và đọc lại đúng chế độ", () => {
      setStoredScrollMode("page-flip");
      expect(getStoredScrollMode()).toBe("page-flip");

      setStoredScrollMode("normal");
      expect(getStoredScrollMode()).toBe("normal");
    });
  });

  describe("calculatePageFlipTarget", () => {
    it("tính toán lật trang xuống và lên chính xác khi không có rows DOM giả lập", () => {
      const mockContainer = {
        scrollTop: 100,
        clientHeight: 500,
        scrollHeight: 1500,
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      // header = 40, usable = 460
      const down = calculatePageFlipTarget(mockContainer, "down", 40);
      expect(down).toBe(100 + 460);

      const up = calculatePageFlipTarget(mockContainer, "up", 40);
      expect(up).toBe(0);
    });

    it("10 lần lật trang xuống không vượt quá scrollHeight - clientHeight", () => {
      const mockContainer = {
        scrollTop: 0,
        clientHeight: 500,
        scrollHeight: 2000,
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      let current = 0;
      for (let i = 0; i < 10; i++) {
        mockContainer.scrollTop = current;
        current = calculatePageFlipTarget(mockContainer, "down", 40);
      }
      expect(current).toBeLessThanOrEqual(2000);
    });
  });

  describe("smoothScrollTop với reduced motion", () => {
    it("khi duration <= 0, gán ngay lập tức scrollTop", async () => {
      const mockElement = {
        scrollTop: 0,
        clientHeight: 400,
        scrollHeight: 1000,
      } as unknown as HTMLElement;

      await smoothScrollTop(mockElement, 300, 0);
      expect(mockElement.scrollTop).toBe(300);
    });
  });
});
