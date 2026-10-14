import express from "express";
import { createServer } from "node:http";
import { TextDecoder } from "node:util";
import { describe, expect, it } from "vitest";
import { buildShipmentsChangedEvent, createPushEventBus } from "./pushEvents.mjs";
import { registerPushRoutes } from "./pushRoutes.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(done);
          }),
      });
    });
  });
}

/** Đọc stream SSE tới khi gom đủ `count` event có tên (bỏ comment/heartbeat). */
async function readSseEvents(res, count) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buf = "";
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = {};
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) ev.event = line.slice(7);
        else if (line.startsWith("id: ")) ev.id = line.slice(4);
        else if (line.startsWith("data: ")) ev.data = JSON.parse(line.slice(6));
      }
      if (ev.event) events.push(ev);
    }
  }
  await reader.cancel();
  return events;
}

const state = (version, rows) => ({ version, rows, customers: [] });
const row = (id, warehouse = "TECS-TCS") => ({
  id,
  stt: 1,
  sessionDate: "2026-10-14",
  awb: `618-${id}`,
  warehouse,
  status: "PENDING",
});

describe("GET /api/v1/stream/shipments", () => {
  it("gửi ready, replay theo Last-Event-ID rồi đẩy sự kiện live có lọc kho", async () => {
    const bus = createPushEventBus();
    bus.setBaseline(1);
    bus.publish(buildShipmentsChangedEvent(state(1, []), state(2, [row("a")])));

    const app = express();
    registerPushRoutes(app, { bus, peekStateVersion: async () => 2 });
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/v1/stream/shipments?warehouse=TECS-TCS`, {
        headers: { "Last-Event-ID": "1" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("cache-control")).toContain("no-transform");

      const pending = readSseEvents(res, 3);
      setTimeout(() => {
        bus.publish(
          buildShipmentsChangedEvent(state(2, [row("a")]), state(3, [row("a"), row("x", "TECS-SCSC")])),
        );
        bus.publish(
          buildShipmentsChangedEvent(
            state(3, [row("a"), row("x", "TECS-SCSC")]),
            state(4, [row("a"), row("x", "TECS-SCSC"), row("b")]),
          ),
        );
      }, 50);
      const events = await pending;

      expect(events[0].event).toBe("ready");
      expect(events[1]).toMatchObject({ event: "shipments.changed", id: "2" });
      expect(events[1].data.upserted.map((s) => s.id)).toEqual(["a"]);
      expect(events[2]).toMatchObject({ event: "shipments.changed", id: "4" });
      expect(events[2].data.upserted.map((s) => s.id)).toEqual(["b"]);
    } finally {
      await http.close();
    }
  });

  it("gửi resync khi Last-Event-ID cũ hơn buffer", async () => {
    const bus = createPushEventBus();
    bus.setBaseline(50);
    const app = express();
    registerPushRoutes(app, { bus, peekStateVersion: async () => 50 });
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/v1/stream/shipments?since=10`);
      const events = await readSseEvents(res, 2);
      expect(events.map((e) => e.event)).toEqual(["ready", "resync"]);
      expect(events[1].data.stateVersion).toBe(50);
    } finally {
      await http.close();
    }
  });

  it("400 khi warehouse không hợp lệ", async () => {
    const app = express();
    registerPushRoutes(app, { bus: createPushEventBus(), peekStateVersion: async () => 1 });
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/v1/stream/shipments?warehouse=XYZ`);
      expect(res.status).toBe(400);
    } finally {
      await http.close();
    }
  });
});
