import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { baseContractState } from "./stateMutationContractFixtures.mjs";
import { createMutationTestApp } from "./testMutationApp.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

describe("HTTP mutation smoke", () => {
  it("GET /api/state trả snapshot", async () => {
    const { app } = createMutationTestApp(baseContractState());
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/state`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.version).toBe(10);
      expect(body.rows).toHaveLength(1);
    } finally {
      await http.close();
    }
  });

  it("POST /api/mutation UPDATE roundtrip", async () => {
    const { app } = createMutationTestApp(baseContractState());
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE",
          id: "c-1",
          patch: { flight: "SQ185", dest: "SIN", note: "smoke" },
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.version).toBe(11);
      expect(body.rows[0]?.note).toBe("smoke");
    } finally {
      await http.close();
    }
  });

  it("POST /api/mutation lỗi 400 khi thiếu shipment", async () => {
    const { app } = createMutationTestApp(baseContractState());
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE", id: "missing", patch: { note: "x" } }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/not found/i);
    } finally {
      await http.close();
    }
  });
});
