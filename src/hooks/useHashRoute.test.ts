import { describe, expect, it } from "vitest";
import { hashPath, parseAppHashRoute } from "./useHashRoute";

describe("hashPath / parseAppHashRoute", () => {
  it("cắt query — #/stats?mode=today vẫn là stats", () => {
    expect(hashPath("#/stats?mode=today&focus=2026-09-23")).toBe("stats");
    expect(parseAppHashRoute("#/stats")).toBe("stats");
    expect(parseAppHashRoute("#/stats?mode=today&focus=2026-09-23")).toBe("stats");
    expect(parseAppHashRoute("#/stats?mode=week&week=2026-09-15")).toBe("stats");
    expect(parseAppHashRoute("#/stats/")).toBe("stats");
  });

  it("không nuốt route khác", () => {
    expect(parseAppHashRoute("#/")).toBe("ops");
    expect(parseAppHashRoute("#/customers")).toBe("customers");
    expect(parseAppHashRoute("#/customers?x=1")).toBe("customers");
    expect(parseAppHashRoute("#/scsc-h21")).toBe("scsc-h21");
  });
});
