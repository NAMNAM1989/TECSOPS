import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsLeftRail } from "./OpsLeftRail";

describe("OpsLeftRail", () => {
  it("rail desktop: brand + nav gồm Hãng và H21 SCSC", () => {
    const html = renderToStaticMarkup(
      <OpsLeftRail active="ops" onNavigate={() => undefined} />,
    );
    expect(html).toContain("ops-left-rail");
    expect(html).toContain("brand-mark");
    expect(html).toContain('data-testid="nav-ops"');
    expect(html).toContain('data-testid="nav-customers"');
    expect(html).toContain('data-testid="nav-airlines"');
    expect(html).toContain('data-testid="nav-scsc-h21"');
    expect(html).toContain('data-testid="nav-stats"');
    expect(html).toContain("<svg");
    expect(html).toContain("AC");
    expect(html).toContain("OPS");
    expect(html).toContain("Hãng");
    expect(html).toContain("H21 SCSC");
  });
});
