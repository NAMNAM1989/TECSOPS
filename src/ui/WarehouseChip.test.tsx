import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WarehouseChip } from "./WarehouseChip";

describe("WarehouseChip", () => {
  it("renders TECS│TCS hub distinction properly", () => {
    const html = renderToStaticMarkup(<WarehouseChip warehouse="TECS-TCS" count={12} />);
    expect(html).toContain("TECS");
    expect(html).toContain("│");
    expect(html).toContain("TCS");
    expect(html).toContain("12");
  });

  it("renders direct TCS properly", () => {
    const html = renderToStaticMarkup(<WarehouseChip warehouse="TCS" />);
    expect(html).toContain("TCS");
    expect(html).not.toContain("│");
  });

  it("renders button role and aria-selected when as=button", () => {
    const html = renderToStaticMarkup(
      <WarehouseChip
        warehouse="SCSC"
        as="button"
        active
        role="tab"
        aria-selected={true}
      />
    );
    expect(html).toContain("<button");
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
  });
});

