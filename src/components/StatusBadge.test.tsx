import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge, StatusProgress, StatusSelect } from "./StatusBadge";
import { statusStep } from "./statusStyles";
import type { ShipmentStatus, Warehouse } from "../types/shipment";

describe("statusStep", () => {
  it("calculates correct step for TCS workflow (6 steps)", () => {
    const wh: Warehouse = "TECS-TCS";
    expect(statusStep("PENDING", wh)).toEqual({ n: 1, of: 6 });
    expect(statusStep("RECEIVED", wh)).toEqual({ n: 2, of: 6 });
    expect(statusStep("VOLUME_DONE", wh)).toEqual({ n: 3, of: 6 });
    expect(statusStep("OLA_PULL", wh)).toEqual({ n: 4, of: 6 });
    expect(statusStep("RECEPTION_COMPLETED", wh)).toEqual({ n: 5, of: 6 });
    expect(statusStep("WEIGH_SLIP", wh)).toEqual({ n: 6, of: 6 });
  });

  it("calculates correct step for SCSC workflow (5 steps - no RECEPTION_COMPLETED)", () => {
    const wh: Warehouse = "TECS-SCSC";
    expect(statusStep("PENDING", wh)).toEqual({ n: 1, of: 5 });
    expect(statusStep("RECEIVED", wh)).toEqual({ n: 2, of: 5 });
    expect(statusStep("VOLUME_DONE", wh)).toEqual({ n: 3, of: 5 });
    expect(statusStep("OLA_PULL", wh)).toEqual({ n: 4, of: 5 });
    expect(statusStep("WEIGH_SLIP", wh)).toEqual({ n: 5, of: 5 });
    // RECEPTION_COMPLETED is not in SCSC workflow
    expect(statusStep("RECEPTION_COMPLETED", wh)).toBeNull();
  });

  it("returns null for legacy statuses", () => {
    const legacy: ShipmentStatus[] = ["CUSTOMS", "SECURITY", "COMPLETED"];
    for (const st of legacy) {
      expect(statusStep(st, "TECS-TCS")).toBeNull();
      expect(statusStep(st, "TECS-SCSC")).toBeNull();
    }
  });
});

describe("StatusBadge", () => {
  it("renders status icon, label and step fraction", () => {
    const html = renderToStaticMarkup(
      <StatusBadge status="VOLUME_DONE" warehouse="TECS-TCS" size="sm" />
    );
    expect(html).toContain("Đã đo Volume");
    expect(html).toContain("3/6");
    expect(html).toContain("Trạng thái: Đã đo Volume, bước 3 trên 6");
    expect(html).toContain("▣");
  });

  it("renders compact variant without step if showStep=false", () => {
    const html = renderToStaticMarkup(
      <StatusBadge status="RECEIVED" warehouse="TECS-TCS" variant="compact" showStep={false} />
    );
    expect(html).toContain("Nhận");
    expect(html).not.toContain("2/6");
  });

  it("renders button when onClick is passed", () => {
    const html = renderToStaticMarkup(
      <StatusBadge status="PENDING" onClick={() => {}} />
    );
    expect(html).toContain("<button");
    expect(html).toContain("Booking");
  });
});

describe("StatusProgress", () => {
  it("renders correct number of dots according to warehouse", () => {
    const htmlTcs = renderToStaticMarkup(
      <StatusProgress status="VOLUME_DONE" warehouse="TECS-TCS" />
    );
    // 6 dots for TCS
    const dotsTcs = htmlTcs.match(/class="[^"]*(?:h-1\.5|h-2)[^"]*"/g);
    expect(dotsTcs?.length).toBe(6);

    const htmlScsc = renderToStaticMarkup(
      <StatusProgress status="VOLUME_DONE" warehouse="TECS-SCSC" />
    );
    // 5 dots for SCSC
    const dotsScsc = htmlScsc.match(/class="[^"]*(?:h-1\.5|h-2)[^"]*"/g);
    expect(dotsScsc?.length).toBe(5);
  });
});

describe("StatusSelect", () => {
  it("renders select element with workflow options", () => {
    const html = renderToStaticMarkup(
      <StatusSelect
        value="RECEIVED"
        onChange={() => {}}
        warehouse="TECS-TCS"
      />
    );
    expect(html).toContain("<select");
    expect(html).toContain("Nhận hàng");
    expect(html).toContain("Đã đo Volume");
  });
});
