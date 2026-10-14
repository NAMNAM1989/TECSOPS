import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./exportStore.mjs", () => ({
  peekExportStateVersion: vi.fn(async () => 7),
  queryExportShipments: vi.fn(async () => ({
    query: { sessionDate: "2026-09-12", warehouse: null, status: null, awb: null, id: null, limit: 500, view: "core" },
    shipments: [
      {
        id: "s-1",
        stt: 1,
        sessionDate: "2026-09-12",
        awb: "618-54405131",
        warehouse: "TECS-TCS",
        status: "PENDING",
      },
    ],
    nextCursor: null,
  })),
  queryExportShipmentById: vi.fn(async (id) =>
    id === "s-1"
      ? {
          id: "s-1",
          stt: 1,
          sessionDate: "2026-09-12",
          awb: "618-54405131",
          warehouse: "TECS-TCS",
          status: "PENDING",
        }
      : null,
  ),
  queryExportCustomers: vi.fn(async () => ({
    query: { q: null, id: null, code: null, limit: 200 },
    customers: [{ id: "c-1", code: "ACME", name: "Acme", syncedAt: null }],
  })),
}));

import { registerExportRoutes } from "./exportRoutes.mjs";
import { peekExportStateVersion, queryExportShipments } from "./exportStore.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

describe("exportRoutes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/v1/export/meta + shipments + 304", async () => {
    const app = express();
    registerExportRoutes(app, { requireAuth: (_req, _res, next) => next() });
    const http = await listen(app);
    try {
      const meta = await fetch(`${http.baseUrl}/api/v1/export/meta`);
      expect(meta.status).toBe(200);
      expect(meta.headers.get("etag")).toBe('W/"tecsops-export-v7"');
      const metaBody = await meta.json();
      expect(metaBody.stateVersion).toBe(7);
      expect(metaBody.endpoints.shipments).toBe("/api/v1/export/shipments");

      const list = await fetch(
        `${http.baseUrl}/api/v1/export/shipments?sessionDate=2026-09-12`,
      );
      expect(list.status).toBe(200);
      const listBody = await list.json();
      expect(listBody.ok).toBe(true);
      expect(listBody.schemaVersion).toBe(1);
      expect(listBody.shipments[0].awb).toBe("618-54405131");
      expect(queryExportShipments).toHaveBeenCalled();

      const cached = await fetch(
        `${http.baseUrl}/api/v1/export/shipments?sessionDate=2026-09-12`,
        { headers: { "If-None-Match": 'W/"tecsops-export-v7"' } },
      );
      expect(cached.status).toBe(304);
      expect(peekExportStateVersion).toHaveBeenCalled();
    } finally {
      await http.close();
    }
  });

  it("404 khi shipment không tồn tại", async () => {
    const app = express();
    registerExportRoutes(app, { requireAuth: (_req, _res, next) => next() });
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/v1/export/shipments/missing`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("EXPORT_SHIPMENT_NOT_FOUND");
    } finally {
      await http.close();
    }
  });
});
