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
  onNavigateCustomers: () => undefined,
  onOpenAirlineLabels: () => undefined,
  onDownloadDayExcel: () => undefined,
  onCopyCargoDayReport: () => undefined,
  viewRows: [tcs],
};

describe("OpsActionToolbar", () => {
  it("desktop: nhóm lệnh + công cụ + copy ảnh", () => {
    const html = renderToStaticMarkup(
      <OpsActionToolbar variant="desktop" {...baseProps} onNavigateStats={() => undefined} />,
    );
    expect(html).toContain("ops-action-toolbar");
    expect(html).toContain('data-variant="desktop"');
    expect(html).toContain('aria-label="+ Booking TCS"');
    expect(html).toContain("Nhập Sheet");
    expect(html).toContain("Khách");
    expect(html).toContain("Tên hãng");
    expect(html).toContain("ops-cargo-report-toolbar");
    expect(html).toContain("Vantage");
    expect(html).toContain("TCS");
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
    expect(html).toContain("Hãng");
    expect(html).toContain("Excel");
  });
});
