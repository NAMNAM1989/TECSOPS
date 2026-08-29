import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";
import { OpsDayOverviewStrip } from "./OpsDayOverviewStrip";

function lot(
  warehouse: Shipment["warehouse"],
  pcs: number,
  kg: number,
  id: string,
): Shipment {
  return {
    ...blankShipmentDraft("2026-08-21", warehouse),
    id,
    stt: 1,
    pcs,
    kg,
  } as Shipment;
}

const rows: Shipment[] = [
  lot("TCS", 2, 10, "tcs"),
  lot("SCSC", 3, 6, "scsc"),
  lot("TECS-TCS", 1, 4, "tecs-tcs"),
  lot("TECS-SCSC", 4, 8, "tecs-scsc"),
];

function renderStrip(variant: "desktop" | "mobile", filtered = rows) {
  return renderToStaticMarkup(
    <OpsDayOverviewStrip
      variant={variant}
      selectedYmd="2026-08-21"
      rows={filtered}
      activeWarehouse="TCS"
      onSelectWarehouse={() => undefined}
      filtersActive={filtered.length !== rows.length}
    />,
  );
}

describe("OpsDayOverviewStrip", () => {
  it("desktop: tổng gọn một dòng + chip kho cuộn ngang", () => {
    const html = renderStrip("desktop");
    expect(html).toContain("ops-day-overview");
    expect(html).toContain("ops-day-pulse");
    expect(html).toContain("Tổng");
    expect(html).toContain("4");
    expect(html).toContain("10");
    expect(html).toContain("28");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("TECS-TCS");
    expect(html).toContain("SCSC");
    expect(html).toContain('aria-label="Chọn kho"');
    expect(html).not.toContain("21-AUG-2026");
    expect(html).not.toContain("bg-emerald-600");
    expect(html).not.toContain("Vantage");
  });

  it("mobile: chip cuộn min-h-10, mỗi kho Lô · Kiện · Kg", () => {
    const html = renderStrip("mobile");
    expect(html).toContain("ops-day-pulse");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("min-h-10");
    expect(html).toContain("TCS");
    expect(html).toContain("Lô 1");
    expect(html).toContain("overflow-x-auto");
  });

  it("lọc text/status: pulse + chip theo rows đã lọc", () => {
    const html = renderStrip("desktop", [rows[0]!]);
    expect(html).toContain("Tổng*");
    expect(html).toContain("sau lọc");
    expect(html).toContain("1");
    expect(html).toContain("Lô 0");
  });
});
