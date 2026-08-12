import { describe, expect, it } from "vitest";
import {
  extractJsonFromGeminiText,
  generateGeminiJson,
  isGeminiConfigured,
} from "./geminiClient.mjs";

describe("extractJsonFromGeminiText", () => {
  it("parse JSON thuần", () => {
    expect(extractJsonFromGeminiText('{"summary":"ok"}')).toEqual({
      summary: "ok",
    });
  });

  it("strip code fence", () => {
    expect(
      extractJsonFromGeminiText('```json\n{"summary":"x"}\n```')
    ).toEqual({ summary: "x" });
  });

  it("lấy object giữa text thừa", () => {
    expect(extractJsonFromGeminiText('Here:\n{"a":1}\nend')).toEqual({ a: 1 });
  });

  it("GEMINI_DISABLED fail-fast, không gọi network dù có key", async () => {
    const previousDisabled = process.env.GEMINI_DISABLED;
    const previousKey = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_DISABLED = "1";
      process.env.GEMINI_API_KEY = "configured-but-disabled";
      expect(isGeminiConfigured()).toBe(false);
      await expect(generateGeminiJson({ user: "test" })).rejects.toMatchObject({
        code: "GEMINI_NOT_CONFIGURED",
      });
    } finally {
      if (previousDisabled === undefined) delete process.env.GEMINI_DISABLED;
      else process.env.GEMINI_DISABLED = previousDisabled;
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });
});
