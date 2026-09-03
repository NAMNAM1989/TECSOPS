import { describe, expect, it } from "vitest";
import { parseAppState, parseAppStateFetchResult } from "./appStateParse";

describe("parseAppStateFetchResult", () => {
  it("parses unchanged delta response", () => {
    expect(parseAppStateFetchResult({ version: 42, unchanged: true })).toEqual({
      kind: "unchanged",
      version: 42,
    });
    expect(parseAppState({ version: 42, unchanged: true })).toBeNull();
  });

  it("parses full snapshot", () => {
    const raw = { version: 7, rows: [], customers: [] };
    expect(parseAppStateFetchResult(raw)).toEqual({
      kind: "full",
      state: expect.objectContaining({ version: 7, rows: [] }),
    });
  });
});
