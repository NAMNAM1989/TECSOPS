import { describe, expect, it, afterEach } from "vitest";
import { assertMutationAllowed } from "./mutationGuards.mjs";

describe("mutationGuards", () => {
  const prev = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it("cho phép RESET_TRIAL_DATA khi không phải production", () => {
    process.env.NODE_ENV = "development";
    expect(() => assertMutationAllowed({ action: "RESET_TRIAL_DATA" })).not.toThrow();
  });

  it("chặn RESET_TRIAL_DATA trên production", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertMutationAllowed({ action: "RESET_TRIAL_DATA" })).toThrow(
      /RESET_TRIAL_DATA/
    );
  });

  it("cho phép mutation thường trên production", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertMutationAllowed({ action: "UPDATE", id: "x", patch: {} })).not.toThrow();
  });
});
