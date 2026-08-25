import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";
import { OpsCargoReportToolbar } from "./OpsCargoReportToolbar";

const tcs = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  stt: 1,
  pcs: 2,
  kg: 10,
} as Shipment;

describe("OpsCargoReportToolbar", () => {
  it("desktop: 4 nút hiện, TCS bật / Vantage tắt", () => {
    const html = renderToStaticMarkup(
      <OpsCargoReportToolbar
        variant="desktop"
        viewRows={[tcs]}
        onCopy={() => undefined}
      />,
    );
    expect(html).toContain("ops-cargo-report-toolbar");
    expect(html).toContain('data-variant="desktop"');
    expect(html).toContain("Vantage");
    expect(html).toContain("Tecs");
    expect(html).toContain("TCS");
    expect(html).toContain("SCSC");
    expect(html).toMatch(/data-testid="ops-cargo-report-vantage"[^>]*disabled=""/);
    expect(html).not.toMatch(/data-testid="ops-cargo-report-tcs"[^>]*disabled=""/);
  });

  it("mobile: chip ≥44px, copying hiện Đang copy…", () => {
    const html = renderToStaticMarkup(
      <OpsCargoReportToolbar
        variant="mobile"
        viewRows={[tcs]}
        copying
        onCopy={() => undefined}
      />,
    );
    expect(html).toContain('data-variant="mobile"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("Đang copy…");
    expect(html).toContain("aria-busy");
    expect(html).toContain("Vantage");
  });
});
