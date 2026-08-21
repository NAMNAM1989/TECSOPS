import { describe, expect, it } from "vitest";
import {
  agentProcessEnabled,
  dualAgentEnabled,
  explicitFlagOn,
  resolveAutoOpen,
} from "./start-fullstack-flags.mjs";

describe("start-fullstack-flags", () => {
  it("dualAgentEnabled chỉ true khi TCS_AGENT_DUAL explicit", () => {
    expect(dualAgentEnabled({})).toBe(false);
    expect(
      dualAgentEnabled({
        TCS_USERNAME_TCS: "namnam8012",
        TCS_PASSWORD_TCS: "secret",
      })
    ).toBe(false);
    expect(dualAgentEnabled({ TCS_AGENT_DUAL: "0" })).toBe(false);
    expect(dualAgentEnabled({ TCS_AGENT_DUAL: "1" })).toBe(true);
    expect(dualAgentEnabled({ TCS_AGENT_DUAL: "true" })).toBe(true);
    expect(dualAgentEnabled({ TCS_AGENT_DUAL: "on" })).toBe(true);
  });

  it("resolveAutoOpen trống là 0", () => {
    expect(resolveAutoOpen({})).toBe("0");
    expect(resolveAutoOpen({ TCS_AUTO_OPEN: "" })).toBe("0");
    expect(resolveAutoOpen({ TCS_AUTO_OPEN: "1" })).toBe("1");
    expect(resolveAutoOpen({ TCS_AUTO_OPEN: "0" })).toBe("0");
  });

  it("agentProcessEnabled mặc định bật HTTP", () => {
    expect(agentProcessEnabled({})).toBe(true);
    expect(agentProcessEnabled({ TCS_AGENT_ENABLED: "0" })).toBe(false);
    expect(agentProcessEnabled({ TCS_AGENT_ENABLED: "1" })).toBe(true);
  });

  it("explicitFlagOn không nhận yes", () => {
    expect(explicitFlagOn("yes")).toBe(false);
    expect(explicitFlagOn("1")).toBe(true);
  });
});
