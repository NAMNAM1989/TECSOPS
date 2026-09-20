import { describe, expect, it, vi } from "vitest";
import { shouldFetchGlobalSearch, lotHitsFromGlobalSearch, fetchGlobalSearch } from "./globalSearchApi";

describe("globalSearchApi helpers", () => {
  it("fetches when query has 3+ folded chars or AWB digits", () => {
    expect(shouldFetchGlobalSearch("ab")).toBe(false);
    expect(shouldFetchGlobalSearch("784")).toBe(true);
    expect(shouldFetchGlobalSearch("nguyen")).toBe(true);
  });

  it("keeps only valid lot hits", () => {
    const lots = lotHitsFromGlobalSearch({
      from: "2026-08-21",
      to: "2026-09-20",
      hits: [
        {
          type: "lot",
          id: "s1",
          sessionDate: "2026-09-19",
          awb: "784-2004 2005",
          dest: "SIN",
          warehouse: "TCS",
          kind: "mawb",
          label: "784-2004 2005",
        },
        { type: "customer", id: "c1", code: "ABC", name: "ABC" },
        {
          type: "lot",
          id: "",
          sessionDate: "2026-09-19",
          awb: "x",
          dest: "",
          warehouse: "TCS",
          kind: "other",
          label: "x",
        },
      ],
    });
    expect(lots).toHaveLength(1);
    expect(lots[0]?.id).toBe("s1");
  });

  it("sends excludeSession on GET /api/search", async () => {
    const orig = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/search?");
      expect(url).toContain("q=7842004");
      expect(url).toContain("excludeSession=2026-09-20");
      return new Response(JSON.stringify({ hits: [], from: "a", to: "b" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const body = await fetchGlobalSearch({ q: "7842004", excludeSession: "2026-09-20" });
      expect(body.hits).toEqual([]);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      globalThis.fetch = orig;
    }
  });
});
