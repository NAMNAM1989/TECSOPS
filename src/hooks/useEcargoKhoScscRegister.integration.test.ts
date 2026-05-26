import * as React from "react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useEcargoKhoScscRegister } from "./useEcargoKhoScscRegister";
import type { AppState } from "../utils/shipmentMutations";

const baseState: AppState = {
  version: 1,
  rows: [],
  customers: [],
  ecargoKhoScsc: {},
};

function Harness({
  state,
  mutate,
  onReady,
}: {
  state: AppState;
  mutate: ReturnType<typeof vi.fn>;
  onReady: (api: ReturnType<typeof useEcargoKhoScscRegister>) => void;
}) {
  const api = useEcargoKhoScscRegister(state, mutate);
  React.useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return null;
}

describe("useEcargoKhoScscRegister — lưu cloud", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("debounce gọi PATCH_ECARGO_KHO_SCSC khi setVehicle", async () => {
    const mutate = vi.fn().mockResolvedValue(baseState);
    let api: ReturnType<typeof useEcargoKhoScscRegister> | null = null;

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          state: baseState,
          mutate,
          onReady: (a) => {
            api = a;
          },
        })
      );
    });

    expect(api).not.toBeNull();
    act(() => {
      api!.setVehicle("row-1", "50h17480");
    });

    expect(mutate).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(320);
    });

    expect(mutate).toHaveBeenCalledWith({
      action: "PATCH_ECARGO_KHO_SCSC",
      shipmentId: "row-1",
      vehicleInput: "50H17480",
    });
  });
});
