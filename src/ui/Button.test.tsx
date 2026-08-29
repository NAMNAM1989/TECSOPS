import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./Button";
import { Wordmark } from "./Wordmark";

describe("ui primitives (Đợt A)", () => {
  it("Button primary có label và type button", () => {
    const html = renderToStaticMarkup(<Button>Lưu</Button>);
    expect(html).toContain("Lưu");
    expect(html).toContain('type="button"');
    expect(html).toContain("bg-ui-primary");
  });

  it("Wordmark tách AirCargo / _OPS", () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toContain("AirCargo");
    expect(html).toContain("_OPS");
    expect(html).toContain('aria-label="AirCargo_OPS"');
    expect(html).toContain("text-ui-primary");
  });
});
