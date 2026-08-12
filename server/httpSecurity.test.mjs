import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySecurityHeaders,
  createMutationRateLimit,
  mutationErrorPayload,
} from "./httpSecurity.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

const openedServers = [];

afterEach(async () => {
  await Promise.all(openedServers.splice(0).map((http) => http.close()));
});

describe("HTTP security", () => {
  it("gắn security headers trên health và HSTS ở production", async () => {
    const app = express();
    app.use(applySecurityHeaders({ isProduction: true }));
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    const http = await listen(app);
    openedServers.push(http);

    const response = await fetch(`${http.baseUrl}/api/health`);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("rate-limit mutation trả 429 và Retry-After", async () => {
    const app = express();
    app.use("/api/mutation", createMutationRateLimit({ max: 2, windowMs: 60_000 }));
    app.post("/api/mutation", (_req, res) => res.json({ ok: true }));
    const http = await listen(app);
    openedServers.push(http);

    expect((await fetch(`${http.baseUrl}/api/mutation`, { method: "POST" })).status).toBe(200);
    expect((await fetch(`${http.baseUrl}/api/mutation`, { method: "POST" })).status).toBe(200);
    const limited = await fetch(`${http.baseUrl}/api/mutation`, { method: "POST" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    await expect(limited.json()).resolves.toMatchObject({
      code: "MUTATION_RATE_LIMITED",
    });
  });

  it("production không trả raw mutation error", () => {
    const secretError = new Error("connect /internal/private/path failed");
    expect(
      mutationErrorPayload(secretError, {
        isProduction: true,
        fallback: "Không thể cập nhật dữ liệu.",
      }),
    ).toEqual({
      error: "Không thể cập nhật dữ liệu.",
      code: "MUTATION_REJECTED",
    });
    expect(
      mutationErrorPayload(secretError, {
        isProduction: false,
        fallback: "Không thể cập nhật dữ liệu.",
      }).error,
    ).toContain("/internal/private/path");
  });
});
