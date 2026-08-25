import { describe, expect, it, vi } from "vitest";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";
import {
  buildOpsCargoReportItems,
  listOpsCargoReportActions,
} from "./opsCargoReportItems";

function lot(warehouse: Shipment["warehouse"]): Shipment {
  return {
    ...blankShipmentDraft("2026-08-23", warehouse),
    id: `${warehouse}-1`,
    stt: 1,
    pcs: 1,
    kg: 1,
  } as Shipment;
}

describe("listOpsCargoReportActions", () => {
  it("disable theo phạm vi kho — TCS không mở Vantage/Tecs/SCSC", () => {
    const actions = listOpsCargoReportActions({ viewRows: [lot("TCS")] });
    expect(actions.map((a) => [a.id, a.disabled])).toEqual([
      ["vantage", true],
      ["tecs", true],
      ["tcs", false],
      ["scsc", true],
    ]);
  });

  it("TECS hub mở Vantage + Tecs, không mở TCS/SCSC trực tiếp", () => {
    const actions = listOpsCargoReportActions({
      viewRows: [lot("TECS-TCS"), lot("TECS-SCSC")],
    });
    expect(actions.find((a) => a.id === "vantage")?.disabled).toBe(false);
    expect(actions.find((a) => a.id === "tecs")?.disabled).toBe(false);
    expect(actions.find((a) => a.id === "tcs")?.disabled).toBe(true);
    expect(actions.find((a) => a.id === "scsc")?.disabled).toBe(true);
  });

  it("copying khóa cả 4 nút, vẫn giữ tên (không đổi thành Đang copy…)", () => {
    const actions = listOpsCargoReportActions({
      viewRows: [lot("TCS"), lot("SCSC"), lot("TECS-TCS")],
      copying: true,
    });
    expect(actions.every((a) => a.disabled)).toBe(true);
    expect(actions.map((a) => a.label)).toEqual(["Vantage", "Tecs", "TCS", "SCSC"]);
  });
});

describe("buildOpsCargoReportItems", () => {
  it("gọi onCopy đúng kind", () => {
    const onCopy = vi.fn();
    const items = buildOpsCargoReportItems({
      viewRows: [lot("SCSC")],
      onCopy,
    });
    items.find((i) => i.id === "scsc")?.onSelect();
    expect(onCopy).toHaveBeenCalledWith("scsc");
  });
});
