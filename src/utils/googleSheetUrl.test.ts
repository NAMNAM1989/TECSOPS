import { describe, expect, it } from "vitest";
import { parseGoogleSpreadsheetId, parseGoogleSheetLink } from "./googleSheetUrl";

describe("parseGoogleSpreadsheetId", () => {
  it("lấy id từ URL docs.google.com", () => {
    const r = parseGoogleSpreadsheetId(
      "https://docs.google.com/spreadsheets/d/1AbC_dEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0"
    );
    expect(r).toEqual({
      ok: true,
      spreadsheetId: "1AbC_dEfGhIjKlMnOpQrStUvWxYz0123456789",
    });
  });

  it("chấp nhận id thuần", () => {
    const id = "1AbC_dEfGhIjKlMnOpQrStUvWxYz0123456789";
    expect(parseGoogleSpreadsheetId(id)).toEqual({ ok: true, spreadsheetId: id });
  });

  it("từ chối rỗng / URL sai", () => {
    expect(parseGoogleSheetLink("").ok).toBe(false);
    expect(parseGoogleSheetLink("https://example.com/sheet").ok).toBe(false);
  });

  it("trích gid từ URL", () => {
    const r = parseGoogleSheetLink(
      "https://docs.google.com/spreadsheets/d/15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4/edit?gid=1927213684#gid=1927213684"
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spreadsheetId).toBe("15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4");
      expect(r.sheetGid).toBe("1927213684");
    }
  });
});
