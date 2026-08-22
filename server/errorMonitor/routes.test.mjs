import { describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { createErrorMonitorAgent } from "./agent.mjs";
import { registerErrorMonitorRoutes } from "./routes.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

describe("error-monitor HTTP", () => {
  it("health + ingest 500 không làm chết app", async () => {
    const app = express();
    app.use(express.json());
    const agent = createErrorMonitorAgent({ environment: "test" });
    registerErrorMonitorRoutes(app, { agent });
    const http = await listen(app);
    try {
      const health = await fetch(`${http.baseUrl}/api/error-monitor/health`);
      expect(health.status).toBe(200);
      const body = await health.json();
      expect(body.agent).toBe("ERROR_MONITOR_AGENT");

      const ingest = await fetch(`${http.baseUrl}/api/error-monitor/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "backend",
          message: "Internal Server Error",
          http: { status: 500, path: "/api/state" },
        }),
      });
      expect(ingest.status).toBe(200);
      const ev = await ingest.json();
      expect(ev.ok).toBe(true);
      expect(ev.dispatched).toBe(true);
      expect(ev.bug_id).toMatch(/^bug_/);
    } finally {
      await http.close();
    }
  });
});
