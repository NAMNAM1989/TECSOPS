import { describe, expect, it } from "vitest";
import {
  clampScscWeighPrintSettings,
  defaultScscWeighPrintSettings,
  patchScscSenderForWarehouse,
  resolveScscSenderForWarehouse,
} from "./scscWeighPrintSettingsCore";

describe("clampScscWeighPrintSettings", () => {
  it("chuẩn hóa senders theo kho", () => {
    expect(
      clampScscWeighPrintSettings({
        senders: {
          "TECS-SCSC": { senderName: "  A  ", senderPhone: "0901" },
          "KHO-SCSC": { senderName: "B", senderPhone: "0902" },
        },
      })
    ).toEqual({
      senders: {
        "TECS-SCSC": { senderName: "A", senderPhone: "0901" },
        "KHO-SCSC": { senderName: "B", senderPhone: "0902" },
      },
    });
  });

  it("migrate legacy flat sender", () => {
    expect(
      clampScscWeighPrintSettings({
        senderName: "Legacy",
        senderPhone: "99",
      })
    ).toEqual({
      senders: {
        "TECS-SCSC": { senderName: "Legacy", senderPhone: "99" },
        "KHO-SCSC": { senderName: "Legacy", senderPhone: "99" },
      },
    });
  });
});

describe("resolveScscSenderForWarehouse", () => {
  it("lấy đúng block theo kho", () => {
    const s = clampScscWeighPrintSettings({
      senders: {
        "TECS-SCSC": { senderName: "Tecs", senderPhone: "1" },
        "KHO-SCSC": { senderName: "Kho", senderPhone: "2" },
      },
    });
    expect(resolveScscSenderForWarehouse(s, "TECS-SCSC").senderName).toBe("Tecs");
    expect(resolveScscSenderForWarehouse(s, "KHO-SCSC").senderName).toBe("Kho");
  });
});

describe("patchScscSenderForWarehouse", () => {
  it("giữ dấu cách khi đang gõ", () => {
    const base = defaultScscWeighPrintSettings();
    const next = patchScscSenderForWarehouse(base, "TECS-SCSC", { senderName: "Nguyen Van " });
    expect(next.senders["TECS-SCSC"].senderName).toBe("Nguyen Van ");
  });
});
