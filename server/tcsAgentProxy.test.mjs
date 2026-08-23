import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import {
  isTcsAgentProcessEnabled,
  isTcsAgentProxyEnabled,
  registerTcsAgentProxy,
} from "./tcsAgentProxy.mjs";

describe("tcsAgentProxy stub (A3)", () => {
  /** @type {import("node:http").Server | null} */
  let server = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
    server = null;
  });

  it("proxy/process luôn tắt", () => {
    expect(isTcsAgentProxyEnabled()).toBe(false);
    expect(isTcsAgentProcessEnabled()).toBe(false);
  });

  it("/tcs-agent/* trả 410 AGENT_GONE", async () => {
    const app = express();
    registerTcsAgentProxy(app);
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/tcs-agent/health`);
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: "AGENT_GONE" });
  });
});
