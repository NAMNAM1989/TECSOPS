import { afterEach, describe, expect, it } from "vitest";
import { isTcsAgentProxyEnabled } from "./tcsAgentProxy.mjs";

describe("isTcsAgentProxyEnabled", () => {
  const prevProxy = process.env.TCS_AGENT_PROXY;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prevProxy === undefined) delete process.env.TCS_AGENT_PROXY;
    else process.env.TCS_AGENT_PROXY = prevProxy;
    process.env.NODE_ENV = prevNode;
  });

  it("production: mặc định tắt khi không set TCS_AGENT_PROXY", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TCS_AGENT_PROXY;
    expect(isTcsAgentProxyEnabled()).toBe(false);
  });

  it("production: bật khi TCS_AGENT_PROXY=1 (Docker/Railway)", () => {
    process.env.NODE_ENV = "production";
    process.env.TCS_AGENT_PROXY = "1";
    expect(isTcsAgentProxyEnabled()).toBe(true);
  });

  it("dev: mặc định bật khi không set", () => {
    process.env.NODE_ENV = "development";
    delete process.env.TCS_AGENT_PROXY;
    expect(isTcsAgentProxyEnabled()).toBe(true);
  });
});
