import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import {
  agentTargetForWarehouse,
  isAgentHealthProbe,
  isTcsAgentProcessEnabled,
  isTcsAgentProxyEnabled,
  registerTcsAgentProxy,
} from "./tcsAgentProxy.mjs";

describe("isTcsAgentProxyEnabled", () => {
  const prevProxy = process.env.TCS_AGENT_PROXY;
  const prevNode = process.env.NODE_ENV;
  const prevHub = process.env.TCS_AGENT_URL;
  const prevTcs = process.env.TCS_AGENT_URL_TCS;
  const prevEnabled = process.env.TCS_AGENT_ENABLED;

  afterEach(() => {
    if (prevProxy === undefined) delete process.env.TCS_AGENT_PROXY;
    else process.env.TCS_AGENT_PROXY = prevProxy;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevHub === undefined) delete process.env.TCS_AGENT_URL;
    else process.env.TCS_AGENT_URL = prevHub;
    if (prevTcs === undefined) delete process.env.TCS_AGENT_URL_TCS;
    else process.env.TCS_AGENT_URL_TCS = prevTcs;
    if (prevEnabled === undefined) delete process.env.TCS_AGENT_ENABLED;
    else process.env.TCS_AGENT_ENABLED = prevEnabled;
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

  it("chỉ coi đúng /health là probe offline êm", () => {
    expect(isAgentHealthProbe("/health")).toBe(true);
    expect(isAgentHealthProbe("/health/")).toBe(true);
    expect(isAgentHealthProbe("/workspace/health")).toBe(false);
    expect(isAgentHealthProbe("/jobs")).toBe(false);
  });

  it("TCS_AGENT_ENABLED=0: /health trả AGENT_OFF", async () => {
    process.env.NODE_ENV = "development";
    process.env.TCS_AGENT_PROXY = "1";
    process.env.TCS_AGENT_ENABLED = "0";
    expect(isTcsAgentProcessEnabled()).toBe(false);
    const app = express();
    registerTcsAgentProxy(app);
    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/tcs-agent/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: "AGENT_OFF",
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("agent offline: health trả 200 + ok=false để không spam console", async () => {
    process.env.NODE_ENV = "development";
    process.env.TCS_AGENT_PROXY = "1";
    process.env.TCS_AGENT_ENABLED = "1";
    process.env.TCS_AGENT_URL = "http://127.0.0.1:1";
    const app = express();
    registerTcsAgentProxy(app);
    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/tcs-agent/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        offline: true,
        error: "AGENT_OFFLINE",
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
