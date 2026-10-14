import { beforeEach, describe, expect, it } from "vitest";
import { formatGroupedNumber, THOUSANDS_SEPARATOR_KEY } from "./formatNumber";
import { formatKgTotal } from "./formatKgTotal";

describe("formatGroupedNumber", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to a comma thousands separator", () => {
    expect(formatGroupedNumber(1127)).toBe("1,127");
    expect(formatKgTotal(36947.6)).toBe("36,947.6");
  });

  it("switches separator from localStorage without changing the digits", () => {
    window.localStorage.setItem(THOUSANDS_SEPARATOR_KEY, "dot");
    expect(formatGroupedNumber(1127.5, { maxFractionDigits: 1 })).toBe("1.127,5");
    window.localStorage.setItem(THOUSANDS_SEPARATOR_KEY, "space");
    expect(formatGroupedNumber(1127)).toBe("1 127");
    window.localStorage.setItem(THOUSANDS_SEPARATOR_KEY, "none");
    expect(formatGroupedNumber(1127)).toBe("1127");
  });
});
