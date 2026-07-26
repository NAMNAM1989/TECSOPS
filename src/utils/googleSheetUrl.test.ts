import { describe, expect, it } from "vitest";
import { parseGoogleSpreadsheetId } from "./googleSheetUrl";

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
    expect(parseGoogleSpreadsheetId("").ok).toBe(false);
    expect(parseGoogleSpreadsheetId("https://example.com/sheet").ok).toBe(false);
  });
});
