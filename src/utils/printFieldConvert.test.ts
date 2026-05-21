import { describe, expect, it } from "vitest";
import { printFieldRecordToScscDef, scscDefToPrintFieldPayload } from "./printFieldConvert";
import type { PrintTemplateFieldRecord } from "../types/printTemplate";

describe("printFieldConvert", () => {
  it("chuyển PrintTemplateFieldRecord → ScscFieldDef", () => {
    const rec: PrintTemplateFieldRecord = {
      id: "f1",
      profileId: "p1",
      fieldKey: "mawb",
      posXMm: 140,
      posYMm: 35,
      widthMm: 68,
      fontSizePt: 14,
      lineHeightMm: null,
      heightMm: null,
      maxLines: null,
      align: "left",
      multiline: false,
      bold: true,
      sortOrder: 10,
    };
    const def = printFieldRecordToScscDef(rec);
    expect(def.key).toBe("mawb");
    expect(def.x).toBe(140);
    expect(def.fontPt).toBe(14);
    expect(def.bold).toBe(true);
  });

  it("scscDefToPrintFieldPayload giữ fieldKey và tọa độ mm", () => {
    const payload = scscDefToPrintFieldPayload(
      {
        key: "consignee",
        x: 50,
        y: 100,
        width: 80,
        fontPt: 11,
        multiline: true,
        bold: true,
      },
      undefined,
      5
    );
    expect(payload.fieldKey).toBe("consignee");
    expect(payload.posXMm).toBe(50);
    expect(payload.fontSizePt).toBe(11);
    expect(payload.sortOrder).toBe(5);
  });
});
