import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";
import { OpsActionToolbar } from "./OpsActionToolbar";

const tcs = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  stt: 1,
  pcs: 2,
  kg: 10,
} as Shipment;

const baseProps = {
  activeWarehouse: "TCS" as const,
  onAddBooking: () => undefined,
  onOpenSheetImport: () => undefined,
  onDownloadDayExcel: () => undefined,
  onCopyCargoDayReport: () => undefined,
  viewRows: [tcs],
};

describe("OpsActionToolbar", () => {
  it("desktop: Sync + xuất + ảnh — Booking không trên toolbar", () => {
    const html = renderToStaticMarkup(
      <OpsActionToolbar variant="desktop" {...baseProps} includeBooking={false} />,
    );
    expect(html).toContain("ops-action-toolbar");
    expect(html).toContain('data-variant="desktop"');
    expect(html).toContain("Sync");
    expect(html).toContain("Xuất Excel");
    expect(html).not.toContain("DIM SCSC");
    expect(html).not.toContain('aria-label="+ Booking');
    expect(html).toContain("ops-cargo-report-toolbar");
    expect(html).toContain("Vantage");
    expect(html).toContain("TCS");
    expect(html).not.toContain(">Khách<");
    expect(html).not.toContain(">Thống kê<");
    expect(html).not.toContain("Tên hãng");
    expect(html).toMatch(/data-testid="ops-cargo-report-vantage"[^>]*disabled=""/);
    expect(html).not.toMatch(/data-testid="ops-cargo-report-tcs"[^>]*disabled=""/);
  });

  it("mobile: vùng chạm ≥40px, copying hiện …", () => {
    const html = renderToStaticMarkup(
      <OpsActionToolbar
        variant="mobile"
        {...baseProps}
        includeBooking={false}
        cargoReportCopying
      />,
    );
    expect(html).toContain('data-variant="mobile"');
    expect(html).toContain("min-h-10");
    expect(html).toContain("aria-busy");
    expect(html).toContain("Excel");
    expect(html).not.toContain("Hãng");
  });
});
