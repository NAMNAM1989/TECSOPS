import express from "express";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createAppAuth } from "./appAuth.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

describe("app auth", () => {
  it("production fail-closed khi thiếu token", () => {
    expect(() =>
      createAppAuth({
        token: "",
        isProduction: true,
        allowUnauthenticated: false,
      }),
    ).toThrow(/bắt buộc TECSOPS_APP_TOKEN/i);
  });

  it("status báo required false + allowUnauthenticated khi disableLoginGate", async () => {
    const auth = createAppAuth({
      token: "test-token-at-least-24-characters",
      isProduction: true,
      allowUnauthenticated: true,
      disableLoginGate: true,
    });
    const app = express();
    auth.registerRoutes(app);
    const http = await listen(app);
    try {
      const response = await fetch(`${http.baseUrl}/api/auth/status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        required: false,
        authenticated: true,
        allowUnauthenticated: true,
      });
    } finally {
      await http.close();
    }
  });

  it("disableLoginGate tắt gate dù còn token", async () => {
    const token = "test-token-at-least-24-characters";
    const auth = createAppAuth({
      token,
      isProduction: true,
      allowUnauthenticated: true,
      disableLoginGate: true,
    });
    expect(auth.required).toBe(false);
    const app = express();
    app.get("/private", auth.requireAuth, (_req, res) => res.json({ ok: true }));
    const http = await listen(app);
    try {
      expect((await fetch(`${http.baseUrl}/private`)).status).toBe(200);
    } finally {
      await http.close();
    }
  });

  it("bảo vệ route bằng bearer token", async () => {
    const token = "test-token-at-least-24-characters";
    const auth = createAppAuth({ token, isProduction: false });
    const app = express();
    app.get("/private", auth.requireAuth, (_req, res) => res.json({ ok: true }));
    const http = await listen(app);
    try {
      expect((await fetch(`${http.baseUrl}/private`)).status).toBe(401);
      expect(
        (
          await fetch(`${http.baseUrl}/private`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(200);
    } finally {
      await http.close();
    }
  });

  it("bridge trả session rỗng khi auth không bắt buộc", async () => {
    const auth = createAppAuth({
      token: "test-token-at-least-24-characters",
      isProduction: true,
      allowUnauthenticated: true,
      disableLoginGate: true,
    });
    const app = express();
    auth.registerRoutes(app);
    const http = await listen(app);
    try {
      const response = await fetch(`${http.baseUrl}/api/auth/bridge`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        required: false,
        session: "",
      });
    } finally {
      await http.close();
    }
  });

  it("x-tecsops-session mở được route sau login", async () => {
    const token = "bridge-test-token-24-characters";
    const auth = createAppAuth({ token, isProduction: false });
    const app = express();
    app.use(express.json());
    auth.registerRoutes(app);
    app.get("/private", auth.requireAuth, (_req, res) => res.json({ ok: true }));
    const http = await listen(app);
    try {
      expect((await fetch(`${http.baseUrl}/api/auth/bridge`)).status).toBe(401);
      const login = await fetch(`${http.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie");
      const bridge = await fetch(`${http.baseUrl}/api/auth/bridge`, {
        headers: { Cookie: cookie.split(";")[0] },
      });
      expect(bridge.status).toBe(200);
      const body = await bridge.json();
      expect(body.required).toBe(true);
      expect(String(body.session || "").length).toBeGreaterThan(20);
      expect(
        (
          await fetch(`${http.baseUrl}/private`, {
            headers: { "x-tecsops-session": body.session },
          })
        ).status,
      ).toBe(200);
      expect((await fetch(`${http.baseUrl}/private`)).status).toBe(401);
    } finally {
      await http.close();
    }
  });

  it("login đặt HttpOnly cookie và cookie mở được route", async () => {
    const auth = createAppAuth({
      token: "another-test-token-24-characters",
      isProduction: false,
    });
    const app = express();
    app.use(express.json());
    auth.registerRoutes(app);
    app.get("/private", auth.requireAuth, (_req, res) => res.json({ ok: true }));
    const http = await listen(app);
    try {
      const login = await fetch(`${http.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "another-test-token-24-characters" }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      const response = await fetch(`${http.baseUrl}/private`, {
        headers: { Cookie: cookie.split(";")[0] },
      });
      expect(response.status).toBe(200);
    } finally {
      await http.close();
    }
  });
});
