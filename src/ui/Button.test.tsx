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

  it("Wordmark tách TECS / OPS", () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toContain("TECS");
    expect(html).toContain("OPS");
    expect(html).toContain("text-ui-primary");
  });
});
