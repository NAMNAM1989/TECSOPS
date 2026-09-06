import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsLeftRail } from "./OpsLeftRail";

describe("OpsLeftRail", () => {
  it("rail desktop: brand + nav không còn Hãng; có H21 SCSC/TCS + sync hãng phụ", () => {
    const html = renderToStaticMarkup(
      <OpsLeftRail
        active="ops"
        onNavigate={() => undefined}
        onSyncAirlines={() => undefined}
      />,
    );
    expect(html).toContain("ops-left-rail");
    expect(html).toContain("brand-mark");
    expect(html).toContain('data-testid="nav-ops"');
    expect(html).toContain('data-testid="nav-customers"');
    expect(html).not.toContain('data-testid="nav-airlines"');
    expect(html).toContain('data-testid="sync-airlines-rail"');
    expect(html).toContain('data-testid="nav-scsc-h21"');
    expect(html).toContain('data-testid="nav-tcs-h21"');
    expect(html).toContain('data-testid="nav-stats"');
    expect(html).toContain("<svg");
    expect(html).toContain("AC");
    expect(html).toContain("OPS");
    expect(html).toContain("H21 SCSC");
    expect(html).toContain("H21 TCS");
  });
});
