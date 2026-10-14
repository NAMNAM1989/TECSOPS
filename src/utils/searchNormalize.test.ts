import { describe, expect, it } from "vitest";
import { compactSearchAlnum, foldSearchText } from "./searchNormalize";

describe("searchNormalize", () => {
  it("folds Vietnamese diacritics and đ", () => {
    expect(foldSearchText("Nguyễn Văn A")).toBe("nguyen van a");
    expect(foldSearchText("ĐỒNG NAI")).toBe("dong nai");
  });

  it("compacts AWB and plate punctuation", () => {
    expect(compactSearchAlnum("784-2004 2005")).toBe("78420042005");
    expect(compactSearchAlnum("50H-174.80")).toBe("50h17480");
  });
});
