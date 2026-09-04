import { describe, expect, it } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { useDimLinesHistory } from "./useDimLinesHistory";
import type { DimPieceLine } from "../utils/volumetricDim";

const L = (pcs: number): DimPieceLine => ({
  lCm: 40,
  wCm: 50,
  hCm: 30,
  pcs,
});

type Api = ReturnType<typeof useDimLinesHistory>;

describe("useDimLinesHistory", () => {
  it("undo/redo tối đa 10 bước", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    let api!: Api;

    function Probe() {
      api = useDimLinesHistory([], 10);
      return null;
    }

    act(() => {
      root.render(createElement(Probe));
    });

    for (let i = 1; i <= 12; i++) {
      act(() => {
        api.setLines([L(i)]);
      });
    }

    expect(api.lines[0]?.pcs).toBe(12);
    expect(api.canUndo).toBe(true);

    for (let i = 0; i < 20; i++) {
      act(() => {
        api.undo();
      });
    }

    expect(api.lines[0]?.pcs).toBe(2);
    expect(api.canUndo).toBe(false);

    act(() => {
      api.redo();
    });
    act(() => {
      api.redo();
    });

    expect(api.lines[0]?.pcs).toBe(4);
    expect(api.canRedo).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("replaceLines xóa stack", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    let api!: Api;

    function Probe() {
      api = useDimLinesHistory([L(1)]);
      return null;
    }

    act(() => {
      root.render(createElement(Probe));
    });

    act(() => {
      api.setLines([L(2)]);
    });
    expect(api.canUndo).toBe(true);

    act(() => {
      api.replaceLines([L(9)]);
    });
    expect(api.lines[0]?.pcs).toBe(9);
    expect(api.canUndo).toBe(false);
    expect(api.canRedo).toBe(false);

    act(() => {
      root.unmount();
    });
  });
});
