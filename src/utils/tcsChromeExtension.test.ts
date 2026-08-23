import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapTcsExtension,
  downloadEsidPdfViaExtension,
  fillEcargoVctViaExtension,
  fillEsidViaExtension,
  isPortalBusyExtError,
  pingTcsExtension,
  subscribeTcsExtensionReady,
  tcsExtPresence,
  tcsExtPresenceLabel,
  TCS_EXT_CHANNEL,
  TCS_EXT_CHANNEL_DIRECT,
  TCS_EXT_CHANNEL_SCSC,
  tcsExtChannelForWarehouse,
  tcsEsidExtServesWarehouse,
} from "./tcsChromeExtension";
import { saveTcsExtLoginPrefs } from "./tcsExtLoginPrefs";

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
    localStorage.clear();
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

  it("route channel: TECS-TCS + TCS → Ext TCS; SCSC → Ext SCSC", () => {
    expect(tcsExtChannelForWarehouse("TECS-TCS")).toBe(TCS_EXT_CHANNEL_DIRECT);
    expect(tcsExtChannelForWarehouse("TCS")).toBe(TCS_EXT_CHANNEL_DIRECT);
    expect(tcsExtChannelForWarehouse("SCSC")).toBe(TCS_EXT_CHANNEL_SCSC);
    expect(tcsEsidExtServesWarehouse("TCS", "TECS-TCS")).toBe(true);
    expect(tcsEsidExtServesWarehouse("TECS-TCS", "TCS")).toBe(true);
    expect(tcsEsidExtServesWarehouse("SCSC", "TCS")).toBe(false);
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

  it("eCargo đi qua channel SCSC", async () => {
    const spy = answerNext(
      { ok: true, message: "filled" },
      TCS_EXT_CHANNEL_SCSC
    );
    const result = await fillEcargoVctViaExtension({
      header: { agentName: "A" },
      awbs: [],
    } as never);
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: TCS_EXT_CHANNEL_SCSC,
        type: "FILL_ECARGO_VCT",
      }),
      window.location.origin
    );
  });

  it("DOWNLOAD_ESID_PDF qua channel kho TCS", async () => {
    const spy = answerNext(
      {
        ok: true,
        pdf_name: "297-39702876_ESID.pdf",
        pdf_base64: "JVBERi0xLjQ=",
        downloaded: true,
      },
      TCS_EXT_CHANNEL_DIRECT
    );
    const result = await downloadEsidPdfViaExtension(
      { awb: "29739702876" },
      { warehouse: "TCS" }
    );
    expect(result).toMatchObject({
      ok: true,
      pdf_name: "297-39702876_ESID.pdf",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: TCS_EXT_CHANNEL_DIRECT,
        type: "DOWNLOAD_ESID_PDF",
        payload: { awb: "29739702876" },
      }),
      window.location.origin
    );
  });

  it("DOWNLOAD_ESID_PDF qua channel TECS-TCS", async () => {
    const spy = answerNext({
      ok: true,
      pdf_name: "297-39702876_ESID.pdf",
      pdf_base64: "JVBERi0xLjQ=",
    });
    const result = await downloadEsidPdfViaExtension(
      { awb: "29739702876" },
      { warehouse: "TECS-TCS" }
    );
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: TCS_EXT_CHANNEL_DIRECT,
        type: "DOWNLOAD_ESID_PDF",
      }),
      window.location.origin
    );
  });

  it("gắn expected_username theo kho cho lệnh chạy trên portal", async () => {
    saveTcsExtLoginPrefs("TCS", { username: "namnam8012", remember: true });
    saveTcsExtLoginPrefs("TECS-TCS", { username: "hanam7195", remember: true });

    const pdfSpy = answerNext({ ok: true }, TCS_EXT_CHANNEL_DIRECT);
    await downloadEsidPdfViaExtension({ awb: "29739702876" }, { warehouse: "TCS" });
    expect(pdfSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ expected_username: "namnam8012" }),
      }),
      window.location.origin
    );
    vi.restoreAllMocks();

    const fillSpy = answerNext({ ok: true }, TCS_EXT_CHANNEL_DIRECT);
    await fillEsidViaExtension({ warehouse: "TECS-TCS" } as never);
    expect(fillSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: TCS_EXT_CHANNEL_DIRECT,
        payload: expect.objectContaining({ expected_username: "hanam7195" }),
      }),
      window.location.origin
    );
  });

  it("không ghi đè expected_username do chỗ gọi truyền vào", async () => {
    saveTcsExtLoginPrefs("TCS", { username: "namnam8012", remember: true });
    const spy = answerNext({ ok: true }, TCS_EXT_CHANNEL_DIRECT);
    await downloadEsidPdfViaExtension(
      { awb: "29739702876", expected_username: "khac9999" } as never,
      { warehouse: "TCS" }
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ expected_username: "khac9999" }),
      }),
      window.location.origin
    );
  });

  it("isPortalBusyExtError nhận PORTAL_BUSY", () => {
    expect(isPortalBusyExtError({ error: "PORTAL_BUSY" })).toBe(true);
    expect(isPortalBusyExtError({ error: "WRONG_USER" })).toBe(false);
  });

  it("tcsExtPresence / label cho chip Ops bar", () => {
    expect(tcsExtPresence(null)).toBe("offline");
    expect(tcsExtPresence({ ok: false })).toBe("offline");
    expect(tcsExtPresence({ ok: true })).toBe("ready");
    expect(
      tcsExtPresence({ ok: true, workspace: { logged_in: true } })
    ).toBe("logged_in");
    expect(tcsExtPresenceLabel({ ok: true })).toBe("Ext · sẵn sàng");
    expect(tcsExtPresenceLabel({ ok: false }, { compact: true })).toBe(
      "Ext · offline"
    );
    expect(tcsExtPresenceLabel({ ok: true, workspace: { logged_in: true } })).toBe(
      "Ext · đã login"
    );
  });

  it("subscribeTcsExtensionReady nhận EXT_READY", async () => {
    const seen: Array<{ channel: string; portalWarehouse?: string }> = [];
    const unsub = subscribeTcsExtensionReady((info) => {
      seen.push({
        channel: info.channel,
        portalWarehouse: info.portalWarehouse,
      });
    });
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        origin: window.location.origin,
        data: {
          channel: TCS_EXT_CHANNEL_DIRECT,
          direction: "from-ext",
          type: "EXT_READY",
          ok: true,
          version: "1.5.2",
          portalWarehouse: "TCS",
        },
      })
    );
    await Promise.resolve();
    expect(seen).toEqual([
      { channel: TCS_EXT_CHANNEL_DIRECT, portalWarehouse: "TCS" },
    ]);
    unsub();
  });

  it("lệnh eCargo không bị gắn expected_username", async () => {
    saveTcsExtLoginPrefs("TCS", { username: "namnam8012", remember: true });
    const spy = answerNext({ ok: true }, TCS_EXT_CHANNEL_SCSC);
    await fillEcargoVctViaExtension({ header: { agentName: "A" }, awbs: [] } as never);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FILL_ECARGO_VCT",
        payload: expect.not.objectContaining({ expected_username: expect.anything() }),
      }),
      window.location.origin
    );
  });

  it("ECARGO_OTP_PROVIDE gửi code+verifyUrl qua channel SCSC (không credential)", async () => {
    const { provideEcargoOtpViaExtension } = await import("./tcsChromeExtension");
    const spy = answerNext({ ok: true, phase: "otp_provide" }, TCS_EXT_CHANNEL_SCSC);
    const result = await provideEcargoOtpViaExtension({
      code: "QSSMB88636480ZWUGWM",
      verifyUrl: "https://ecargo.scsc.vn/Export/VCTOrder/Verify?x=1",
    });
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: TCS_EXT_CHANNEL_SCSC,
        type: "ECARGO_OTP_PROVIDE",
        payload: expect.objectContaining({
          code: "QSSMB88636480ZWUGWM",
          verifyUrl: expect.stringContaining("ecargo.scsc.vn"),
        }),
      }),
      window.location.origin
    );
    const sent = spy.mock.calls[0]?.[0] as { payload?: Record<string, unknown> };
    expect(JSON.stringify(sent.payload || {})).not.toMatch(/password|imap|credential/i);
  });
});
