import { describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./copyTextToClipboard";

describe("copyTextToClipboard", () => {
  it("dùng Clipboard API khi có", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const ok = await copyTextToClipboard("50H17480\nVJ085");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("50H17480\nVJ085");

    vi.unstubAllGlobals();
  });

  it("trả false khi chuỗi rỗng", async () => {
    expect(await copyTextToClipboard("")).toBe(false);
  });
});
