import { describe, expect, it } from "vitest";
import {
  normalizeSessionDateParam,
  parseStateScopeFromQuery,
  projectAppState,
} from "../../server/stateScope.mjs";

describe("stateScope", () => {
  it("normalizeSessionDateParam", () => {
    expect(normalizeSessionDateParam("2026-08-12")).toBe("2026-08-12");
    expect(normalizeSessionDateParam("bad")).toBe(null);
  });

  it("parseStateScopeFromQuery full / sessionDate", () => {
    expect(parseStateScopeFromQuery({ full: "1" })).toEqual({
      full: true,
      sessionDate: null,
    });
    expect(parseStateScopeFromQuery({ sessionDate: "2026-08-12" })).toEqual({
      full: false,
      sessionDate: "2026-08-12",
    });
  });

  it("projectAppState filters rows", () => {
    const state = {
      version: 3,
      rows: [
        { id: "a", sessionDate: "2026-08-12" },
        { id: "b", sessionDate: "2026-08-11" },
      ],
      customers: [],
    };
    const projected = projectAppState(state, {
      full: false,
      sessionDate: "2026-08-12",
    });
    expect(projected.rows).toHaveLength(1);
    expect(projected.rows[0].id).toBe("a");
    expect(projected.stateScope).toBe("2026-08-12");
    expect(projectAppState(state, { full: true }).rows).toHaveLength(2);
  });
});
