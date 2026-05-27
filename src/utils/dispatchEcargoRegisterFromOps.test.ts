import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchEcargoRegisterFromOps } from "./dispatchEcargoRegisterFromOps";
import type { EcargoRegisterFromOpsMessage } from "../types/ecargo";

describe("dispatchEcargoRegisterFromOps", () => {
  beforeEach(() => {
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    vi.spyOn(window, "postMessage").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("phát CustomEvent ECARGO_REGISTER_FROM_OPS với detail đúng", () => {
    const envelope: EcargoRegisterFromOpsMessage = {
      type: "ECARGO_REGISTER_FROM_OPS",
      payload: {
        vehicleNo: "50H17480",
        mawb: "978-25562555",
        hawb: "0",
        flight: "VJ85",
        flightDate: "2026-05-10",
        destination: "SYD",
        pcs: 10,
        grossWeight: 200,
        commodity: "Garments",
        shc: "0",
        source: "ops",
        warehouse: "SCSC",
        opsShipmentId: "row-1",
        customerName: "cyl",
      },
    };

    dispatchEcargoRegisterFromOps(envelope);

    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    const ev = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0][0] as CustomEvent;
    expect(ev).toBeInstanceOf(CustomEvent);
    expect(ev.type).toBe("ECARGO_REGISTER_FROM_OPS");
    expect(ev.detail).toEqual(envelope);
    expect((ev as CustomEvent<EcargoRegisterFromOpsMessage>).detail.payload.vehicleNo).toBe("50H17480");
  });

  it("gọi window.postMessage cùng envelope và target *", () => {
    const envelope: EcargoRegisterFromOpsMessage = {
      type: "ECARGO_REGISTER_FROM_OPS",
      payload: {
        vehicleNo: "50H17480",
        mawb: "978-25562555",
        hawb: "0",
        flight: "VJ85",
        flightDate: "2026-05-10",
        destination: "SYD",
        pcs: 10,
        grossWeight: 200,
        commodity: "Garments",
        shc: "0",
        source: "ops",
        warehouse: "SCSC",
        opsShipmentId: "row-1",
        customerName: "",
      },
    };

    dispatchEcargoRegisterFromOps(envelope);

    expect(window.postMessage).toHaveBeenCalledWith(envelope, "*");
  });
});
