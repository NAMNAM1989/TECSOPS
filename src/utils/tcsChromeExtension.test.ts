import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapTcsExtension,
  pingTcsExtension,
  TCS_EXT_CHANNEL,
  TCS_EXT_CHANNEL_DIRECT,
  tcsExtChannelForWarehouse,
} from "./tcsChromeExtension";

function answerNext(
  response: Record<string, unknown>,
  channel = TCS_EXT_CHANNEL
) {
  const spy = vi.spyOn(window, "postMessage").mockImplementation((message) => {
    const request = message as { id?: string; channel?: string };
    queueMicrotask(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: window.location.origin,
          data: {
            channel: request.channel || channel,
            direction: "from-ext",
            id: request.id,
            ...response,
          },
        })
      );
    });
  });
  return spy;
}

describe("tcsChromeExtension bridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ping qua content-script bridge", async () => {
    answerNext({ ok: true, type: "PONG", version: "2.0.0" });
    const result = await pingTcsExtension();
    expect(result).toMatchObject({ ok: true, version: "2.0.0" });
  });

  it("gửi credential và ngày qua bootstrap command", async () => {
    const spy = answerNext({
      ok: true,
      logged_in: true,
      source: "chrome-extension",
    });
    const result = await bootstrapTcsExtension({
      username: "ops",
      password: "pw",
      remember: true,
      session_date: "2026-07-23",
      awbs: ["12312345670"],
    });
    expect(result.logged_in).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TCS_BOOTSTRAP",
        payload: expect.objectContaining({
          username: "ops",
          password: "pw",
          session_date: "2026-07-23",
        }),
      }),
      window.location.origin
    );
  });

  it("bỏ qua phản hồi từ origin lạ", async () => {
    vi.spyOn(window, "postMessage").mockImplementation((message) => {
      const request = message as { id?: string };
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            source: window,
            origin: "https://evil.example",
            data: {
              channel: TCS_EXT_CHANNEL,
              direction: "from-ext",
              id: request.id,
              ok: true,
              type: "PONG",
              version: "9.9.9",
            },
          })
        );
      });
    });
    const result = await pingTcsExtension(50);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("TIMEOUT");
  });

  it("route channel theo kho TECS-TCS vs TCS", () => {
    expect(tcsExtChannelForWarehouse("TECS-TCS")).toBe(TCS_EXT_CHANNEL);
    expect(tcsExtChannelForWarehouse("TCS")).toBe(TCS_EXT_CHANNEL_DIRECT);
  });

  it("ping Ext kho TCS qua channel direct", async () => {
    const spy = answerNext(
      { ok: true, type: "PONG", version: "1.0.0", portalWarehouse: "TCS" },
      TCS_EXT_CHANNEL_DIRECT
    );
    const result = await pingTcsExtension({ warehouse: "TCS" });
    expect(result).toMatchObject({ ok: true, version: "1.0.0" });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: TCS_EXT_CHANNEL_DIRECT,
        type: "PING",
      }),
      window.location.origin
    );
  });
});
