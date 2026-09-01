import express from "express";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createAppAuth } from "./appAuth.mjs";
import { registerLookupRoutes } from "./lookupRoutes.mjs";
import { registerSheetsRoutes } from "./sheets/sheetsRoutes.mjs";

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

describe("sheets + lookup auth gate", () => {
  it("từ chối /api/sheets và /api/lookup khi chưa đăng nhập", async () => {
    const auth = createAppAuth({
      token: "test-token-at-least-24-characters",
      isProduction: true,
      allowUnauthenticated: false,
      disableLoginGate: false,
    });
    const app = express();
    app.use(express.json());
    auth.registerRoutes(app);
    registerSheetsRoutes(app, { io: null, requireAuth: auth.requireAuth });
    registerLookupRoutes(app, { requireAuth: auth.requireAuth });

    const http = await listen(app);
    try {
      const sheets = await fetch(`${http.baseUrl}/api/sheets/book/config`);
      expect(sheets.status).toBe(401);

      const lookup = await fetch(`${http.baseUrl}/api/lookup/airports?q=SGN`);
      expect(lookup.status).toBe(401);
    } finally {
      await http.close();
    }
  });
});
