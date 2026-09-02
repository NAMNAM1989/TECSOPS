import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNav } from "./BottomNav";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";

describe("BottomNav", () => {
  it("mobile: nút mở nav, không thanh full-width cố định", () => {
    const html = renderToStaticMarkup(
      <BottomNav active="ops" onNavigate={() => undefined} />,
    );
    expect(html).toContain("bottom-nav");
    expect(html).toContain("bottom-nav-toggle");
    expect(html).toContain("copy ảnh");
    expect(html).toContain("left-3");
    expect(html).not.toContain("inset-x-0 bottom-0");
    expect(html).not.toContain("bottom-nav-ops");
    expect(html).not.toContain("bottom-nav-cargo-copy");
  });

  it("mở menu: Copy ảnh Vantage/Tecs/TCS/SCSC trước điều hướng", () => {
    const row = {
      ...blankShipmentDraft("2026-08-23", "TECS-TCS"),
      id: "s1",
    } as Shipment;
    const onCopy = vi.fn();
    const html = renderToStaticMarkup(
      <BottomNav
        active="ops"
        defaultOpen
        onNavigate={() => undefined}
        cargoCopy={{
          viewRows: [row],
          copying: false,
          onCopy,
        }}
      />,
    );
    expect(html).toContain("bottom-nav-cargo-copy");
    expect(html).toContain("Copy ảnh");
    expect(html).toContain("bottom-nav-copy-vantage");
    expect(html).toContain("bottom-nav-copy-tecs");
    expect(html).toContain("bottom-nav-copy-tcs");
    expect(html).toContain("bottom-nav-copy-scsc");
    expect(html).toContain("bottom-nav-ops");
    expect(html.indexOf("bottom-nav-cargo-copy")).toBeLessThan(
      html.indexOf("bottom-nav-ops"),
    );
  });
});
