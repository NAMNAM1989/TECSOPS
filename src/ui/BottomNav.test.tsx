import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("3 tab Ops/Khách/TK, cao 52 + safe-area, active primary", () => {
    const html = renderToStaticMarkup(
      <BottomNav active="ops" onNavigate={() => undefined} />,
    );
    expect(html).toContain("bottom-nav");
    expect(html).toContain("Ops");
    expect(html).toContain("Khách");
    expect(html).toContain("TK");
    expect(html).toContain("h-[52px]");
    expect(html).toContain("pb-[max(12px,env(safe-area-inset-bottom))]");
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-ui-primary");
    expect(html).not.toContain("bg-teal-500/12");
  });
});
