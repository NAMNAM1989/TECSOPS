import { describe, expect, it } from "vitest";
import {
  isOpsHash,
  parseOpsUrlState,
  serializeOpsUrlState,
  type OpsUrlState,
} from "./opsUrlState";

describe("opsUrlState", () => {
  describe("isOpsHash", () => {
    it("identifies ops routes correctly", () => {
      expect(isOpsHash("")).toBe(true);
      expect(isOpsHash("#")).toBe(true);
      expect(isOpsHash("#/")).toBe(true);
      expect(isOpsHash("#/ops")).toBe(true);
      expect(isOpsHash("#/ops?d=2026-09-27")).toBe(true);
      expect(isOpsHash("#?d=2026-09-27")).toBe(true);
    });

    it("rejects non-ops routes", () => {
      expect(isOpsHash("#/stats")).toBe(false);
      expect(isOpsHash("#/customers?q=abc")).toBe(false);
      expect(isOpsHash("#/scsc-h21")).toBe(false);
      expect(isOpsHash("#/tcs-h21")).toBe(false);
    });
  });

  describe("parseOpsUrlState", () => {
    it("parses valid parameters from hash query", () => {
      const hash = "#/ops?d=2026-09-27&wh=TECS-TCS&st=attention&q=8584&fd=26SEP&g=flight&lot=lot-123";
      const state = parseOpsUrlState(hash);
      expect(state).toEqual({
        d: "2026-09-27",
        wh: "TECS-TCS",
        st: "attention",
        q: "8584",
        fd: "26SEP",
        g: "flight",
        lot: "lot-123",
      });
    });

    it("ignores invalid values", () => {
      const hash = "#/ops?d=invalid-date&wh=FAKE_WH&st=FAKE_ST";
      const state = parseOpsUrlState(hash);
      expect(state.d).toBeUndefined();
      expect(state.wh).toBeUndefined();
      expect(state.st).toBeUndefined();
    });

    it("returns empty object for empty or non-ops hashes", () => {
      expect(parseOpsUrlState("#/stats?d=2026-09-27")).toEqual({});
      expect(parseOpsUrlState("#/")).toEqual({});
    });
  });

  describe("serializeOpsUrlState", () => {
    it("serializes full state", () => {
      const state: OpsUrlState = {
        d: "2026-09-27",
        wh: "SCSC",
        st: "VOLUME_DONE",
        q: "8584",
        fd: "26SEP",
        g: "flight",
        lot: "lot-999",
      };
      const hash = serializeOpsUrlState(state);
      expect(hash).toBe("#/?d=2026-09-27&wh=SCSC&st=VOLUME_DONE&q=8584&fd=26SEP&g=flight&lot=lot-999");
    });

    it("omits default values", () => {
      const state: OpsUrlState = {
        d: "2026-09-27",
        wh: "TECS-TCS",
        st: "ALL",
        g: "stt",
      };
      const hash = serializeOpsUrlState(state, {
        defaultYmd: "2026-09-27",
        defaultWarehouse: "TECS-TCS",
      });
      expect(hash).toBe("#/");
    });

    it("round-trips between serialize and parse", () => {
      const initial: OpsUrlState = {
        d: "2026-09-25",
        wh: "TCS",
        st: "RECEIVED",
        q: "VJ1813",
        fd: "25SEP",
        lot: "lot-abc",
      };
      const serialized = serializeOpsUrlState(initial);
      const parsed = parseOpsUrlState(serialized);
      expect(parsed).toEqual(initial);
    });
  });
});
