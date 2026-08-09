import { afterEach, describe, expect, it } from "vitest";
import {
  agentTargetForWarehouse,
  isTcsAgentProxyEnabled,
} from "./tcsAgentProxy.mjs";

describe("isTcsAgentProxyEnabled", () => {
  const prevProxy = process.env.TCS_AGENT_PROXY;
  const prevNode = process.env.NODE_ENV;
  const prevHub = process.env.TCS_AGENT_URL;
  const prevTcs = process.env.TCS_AGENT_URL_TCS;

  afterEach(() => {
    if (prevProxy === undefined) delete process.env.TCS_AGENT_PROXY;
    else process.env.TCS_AGENT_PROXY = prevProxy;
    process.env.NODE_ENV = prevNode;
    if (prevHub === undefined) delete process.env.TCS_AGENT_URL;
    else process.env.TCS_AGENT_URL = prevHub;
    if (prevTcs === undefined) delete process.env.TCS_AGENT_URL_TCS;
    else process.env.TCS_AGENT_URL_TCS = prevTcs;
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

  it("dual agent: TCS → :8766, hub → :8765", () => {
    delete process.env.TCS_AGENT_URL;
    delete process.env.TCS_AGENT_URL_TCS;
    expect(agentTargetForWarehouse("TCS")).toBe("http://127.0.0.1:8766");
    expect(agentTargetForWarehouse("TECS-TCS")).toBe("http://127.0.0.1:8765");
  });
});
