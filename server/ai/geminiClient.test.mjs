import { describe, expect, it } from "vitest";
import { extractJsonFromGeminiText } from "./geminiClient.mjs";

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
});
