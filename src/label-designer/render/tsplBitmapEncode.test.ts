import { describe, expect, it } from "vitest";
import { packMonochromeRows } from "./tsplBitmapEncode";

describe("packMonochromeRows", () => {
  it("packs 8x1 black row", () => {
    const data = new Uint8ClampedArray(32);
    for (let x = 0; x < 8; x++) {
      const i = x * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    const { widthBytes, hex } = packMonochromeRows(data, 8, 1);
    expect(widthBytes).toBe(1);
    expect(hex).toBe("FF");
  });

  it("packs white row as zeros", () => {
    const data = new Uint8ClampedArray(32);
    for (let i = 0; i < 32; i++) data[i] = i % 4 === 3 ? 255 : 255;
    const { hex } = packMonochromeRows(data, 8, 1);
    expect(hex).toBe("00");
  });
});
