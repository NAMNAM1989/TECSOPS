import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WarehouseGridPicker } from "./WarehouseGridPicker";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";

const rows: Shipment[] = [
  {
    ...blankShipmentDraft("2026-08-23", "TECS-TCS"),
    id: "a",
    pcs: 2,
    kg: 4,
  } as Shipment,
];

describe("WarehouseGridPicker", () => {
  it("labelOnly: chỉ nhãn ngắn, không metric trong tab, active primary", () => {
    const html = renderToStaticMarkup(
      <WarehouseGridPicker
        rows={rows}
        active="TECS-TCS"
        onSelect={() => undefined}
        chips
        labelOnly
        touchTargets
        hideAddButton
      />,
    );
    expect(html).toContain('data-label-only="true"');
    expect(html).toContain("TECS-TCS");
    expect(html).toContain("TECS-SCSC");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("min-h-11");
    expect(html).toContain("bg-ui-primary");
    expect(html).toContain("bg-ui-surface-muted");
    expect(html).toContain(">TECS-TCS</button>");
    expect(html).toContain(">TECS-SCSC</button>");
    expect(html).not.toContain("Kiện");
    expect(html).not.toContain(">Lô");
  });

  it("desktop chips: vẫn hiện Lô · PCS trong tab", () => {
    const html = renderToStaticMarkup(
      <WarehouseGridPicker
        rows={rows}
        active="TCS"
        onSelect={() => undefined}
        chips
        denseChips
        hideAddButton
      />,
    );
    expect(html).not.toContain('data-label-only="true"');
    expect(html).toContain("TECS-TCS");
    expect(html).toMatch(/1/);
  });
});
