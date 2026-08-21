import { describe, expect, it } from "vitest";
import {
  isTcsAgentHealthStopError,
  shouldPollTcsAgentHealth,
  TCS_AGENT_HEALTH_IDLE_MS,
} from "./tcsAgentHealthPoll";

describe("tcsAgentHealthPoll", () => {
  it("không poll khi toolbar tắt hoặc chưa bấm Đăng Nhập TCS / Quét", () => {
    expect(
      shouldPollTcsAgentHealth({
        toolbarActive: false,
        watching: true,
        sessionOpen: false,
        lastActivityAt: Date.now(),
      }),
    ).toBe(false);
    expect(
      shouldPollTcsAgentHealth({
        toolbarActive: true,
        watching: false,
        sessionOpen: false,
        lastActivityAt: null,
      }),
    ).toBe(false);
  });

  it("poll khi session đang mở", () => {
    expect(
      shouldPollTcsAgentHealth({
        toolbarActive: true,
        watching: false,
        sessionOpen: true,
        lastActivityAt: null,
      }),
    ).toBe(true);
  });

  it("dừng khi AGENT_OFF / AGENT_OFFLINE", () => {
    expect(isTcsAgentHealthStopError("AGENT_OFF")).toBe(true);
    expect(
      shouldPollTcsAgentHealth({
        toolbarActive: true,
        watching: true,
        sessionOpen: true,
        lastActivityAt: Date.now(),
        healthError: "AGENT_OFF",
      }),
    ).toBe(false);
  });

  it("dừng sau idle 2 phút nếu session đóng", () => {
    const now = 1_000_000;
    expect(
      shouldPollTcsAgentHealth({
        toolbarActive: true,
        watching: true,
        sessionOpen: false,
        lastActivityAt: now - TCS_AGENT_HEALTH_IDLE_MS - 1,
        now,
      }),
    ).toBe(false);
    expect(
      shouldPollTcsAgentHealth({
        toolbarActive: true,
        watching: true,
        sessionOpen: false,
        lastActivityAt: now - 1_000,
        now,
      }),
    ).toBe(true);
  });
});
