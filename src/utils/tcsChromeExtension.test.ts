import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapTcsExtension,
  pingTcsExtension,
  TCS_EXT_CHANNEL,
} from "./tcsChromeExtension";

function answerNext(response: Record<string, unknown>) {
  const spy = vi.spyOn(window, "postMessage").mockImplementation((message) => {
    const request = message as { id?: string };
    queueMicrotask(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          data: {
            channel: TCS_EXT_CHANNEL,
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
      "*"
    );
  });
});
