import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CSD_TEMPLATES_ROOT,
  airlineSlotDir,
  isAirlineTemplateReady,
} from "./csdTemplateLoader.mjs";
import {
  decodeUploadBody,
  deleteCsdTemplateBackground,
  normalizeAwbPrefix,
  saveCsdTemplateBackground,
} from "./csdTemplateUpload.mjs";

const TEST_PREFIX = "999";

describe("csdTemplateUpload", () => {
  afterEach(() => {
    const slotAbs = path.join(CSD_TEMPLATES_ROOT, airlineSlotDir(TEST_PREFIX));
    if (fs.existsSync(slotAbs)) fs.rmSync(slotAbs, { recursive: true, force: true });
  });

  it("normalizeAwbPrefix pad 3 số", () => {
    expect(normalizeAwbPrefix("6")).toBe("");
    expect(normalizeAwbPrefix("738")).toBe("738");
    expect(normalizeAwbPrefix("006")).toBe("006");
  });

  it("decodeUploadBody từ base64", () => {
    const body = decodeUploadBody({
      awbPrefix: "738",
      mimeType: "image/png",
      airlineName: "VNA",
      dataBase64: Buffer.from("abc").toString("base64"),
    });
    expect(body.awbPrefix).toBe("738");
    expect(body.airlineName).toBe("VNA");
    expect(body.buffer.toString()).toBe("abc");
  });

  it("lưu và xóa background theo prefix", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const saved = saveCsdTemplateBackground(TEST_PREFIX, png, "image/png", "TEST AIRLINE");
    expect(saved.awbPrefix).toBe(TEST_PREFIX);
    expect(saved.status).toBe("ready");
    expect(isAirlineTemplateReady(TEST_PREFIX)).toBe(true);

    const deleted = deleteCsdTemplateBackground(TEST_PREFIX);
    expect(deleted.status).toBe("pending");
    expect(isAirlineTemplateReady(TEST_PREFIX)).toBe(false);
  });
});
