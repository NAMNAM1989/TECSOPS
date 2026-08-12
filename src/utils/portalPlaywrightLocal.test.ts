import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getPortalPlaywrightLocal,
  setPortalPlaywrightLocal,
} from "./portalPlaywrightLocal";

describe("portalPlaywrightLocal", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("mặc định tắt", () => {
    expect(getPortalPlaywrightLocal()).toBe(false);
  });

  it("bật/tắt qua setter", () => {
    setPortalPlaywrightLocal(true);
    expect(getPortalPlaywrightLocal()).toBe(true);
    setPortalPlaywrightLocal(false);
    expect(getPortalPlaywrightLocal()).toBe(false);
  });
});
