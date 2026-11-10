import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  createWebhookDispatcher,
  parseWebhookConfig,
  verifyWebhookSignature,
} from "./webhookDispatcher.mjs";

const SECRET = "test-secret";

const event = (v) => ({
  type: "shipments.changed",
  eventId: String(v),
  stateVersion: v,
  sessionDates: ["2026-10-14"],
  upserted: [{ id: `s-${v}`, sessionDate: "2026-10-14", warehouse: "TECS-TCS", invoiceItems: [] }],
  removed: [],
  customersChanged: false,
});

function startReceiver(handler) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => handler(req, body, res));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

describe("parseWebhookConfig", () => {
  it("đọc URL hợp lệ, secret, view", () => {
    expect(
      parseWebhookConfig({
        TECSOPS_WEBHOOK_URLS: "https://a.example/h, ftp://bad, http://b.example",
        TECSOPS_WEBHOOK_SECRET: " s ",
        TECSOPS_WEBHOOK_VIEW: "FULL",
      }),
    ).toEqual({ urls: ["https://a.example/h", "http://b.example"], secret: "s", view: "full" });
  });
});

describe("createWebhookDispatcher", () => {
  it("POST có chữ ký HMAC hợp lệ, đúng thứ tự, retry khi 5xx", async () => {
    const received = [];
    let failFirst = true;
    const receiver = await startReceiver((req, body, res) => {
      if (failFirst) {
        failFirst = false;
        res.statusCode = 503;
        res.end();
        return;
      }
      received.push({
        id: req.headers["x-tecsops-event-id"],
        valid: verifyWebhookSignature(
          SECRET,
          req.headers["x-tecsops-timestamp"],
          body,
          req.headers["x-tecsops-signature"],
        ),
        body: JSON.parse(body),
      });
      res.statusCode = 204;
      res.end();
    });
    try {
      const dispatcher = createWebhookDispatcher({
        urls: [receiver.url],
        secret: SECRET,
        retryDelaysMs: [10],
      });
      const first = dispatcher.dispatch(event(5));
      const second = dispatcher.dispatch(event(6));
      await Promise.all([first, second]);

      expect(received.map((r) => r.id)).toEqual(["5", "6"]);
      expect(received.every((r) => r.valid)).toBe(true);
      expect(received[0].body.upserted[0]).not.toHaveProperty("invoiceItems");
    } finally {
      await receiver.close();
    }
  });

  it("chữ ký sai bị từ chối", () => {
    expect(verifyWebhookSignature(SECRET, "1", "{}", "sha256=deadbeef")).toBe(false);
  });
});
