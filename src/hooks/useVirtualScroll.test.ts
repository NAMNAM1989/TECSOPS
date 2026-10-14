import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useVirtualScroll, type VirtualScrollResult } from "./useVirtualScroll";

describe("useVirtualScroll", () => {
  let mockContainer: HTMLDivElement;
  let testRootContainer: HTMLDivElement;

  beforeEach(() => {
    mockContainer = document.createElement("div");
    Object.defineProperty(mockContainer, "clientHeight", {
      value: 600,
      configurable: true,
    });
    Object.defineProperty(mockContainer, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    testRootContainer = document.createElement("div");
    document.body.appendChild(testRootContainer);
  });

  afterEach(() => {
    sessionStorage.clear();
    testRootContainer.remove();
  });

  function renderVirtualHook(options: Parameters<typeof useVirtualScroll>[0]) {
    let hookResult!: VirtualScrollResult;
    function TestComp() {
      hookResult = useVirtualScroll(options);
      return null;
    }
    const root = createRoot(testRootContainer);
    act(() => {
      root.render(React.createElement(TestComp));
    });
    return {
      getResult: () => hookResult,
      unmount: () => {
        act(() => root.unmount());
      },
    };
  }

  it("does not virtualize when count <= VIRTUALIZE_THRESHOLD (100)", () => {
    const { getResult, unmount } = renderVirtualHook({
      count: 50,
      getScrollElement: () => mockContainer,
    });

    const res = getResult();
    expect(res.isVirtualized).toBe(false);
    expect(res.virtualItems).toHaveLength(0);
    expect(res.paddingTop).toBe(0);
    expect(res.paddingBottom).toBe(0);
    unmount();
  });

  it("virtualizes 2000 rows, rendering only visible + overscan items (< 80 rows)", () => {
    const { getResult, unmount } = renderVirtualHook({
      count: 2000,
      estimateSize: 56,
      overscan: 8,
      getScrollElement: () => mockContainer,
    });

    const res = getResult();
    expect(res.isVirtualized).toBe(true);
    expect(res.virtualItems.length).toBeLessThan(80);
    expect(res.virtualItems.length).toBeGreaterThan(10);
    expect(res.startIndex).toBe(0);
    unmount();
  });

  it("restores scroll position from sessionStorage", () => {
    const storageKey = "tecsops.scrollPos.test";
    sessionStorage.setItem(storageKey, "1120"); // item 20

    const { getResult, unmount } = renderVirtualHook({
      count: 200,
      estimateSize: 56,
      getScrollElement: () => mockContainer,
      storageKey,
    });

    const res = getResult();
    expect(res.isVirtualized).toBe(true);
    expect(mockContainer.scrollTop).toBe(1120);
    unmount();
  });
});
