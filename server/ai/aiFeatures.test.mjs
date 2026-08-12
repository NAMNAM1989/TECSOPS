import { describe, expect, it } from "vitest";
import {
  buildAnomalyRules,
  buildEndOfDayAggregate,
  parseBookingText,
  parseDimText,
  parseProfileImage,
  sanitizeOpsSnapshot,
} from "./aiFeatures.mjs";

describe("AI feature contracts", () => {
  it("normalize draft booking theo schema cứng", async () => {
    const result = await parseBookingText(
      { text: "618-54405131 SQ185 SIN 20pcs 100kg" },
      {
        generate: async () => ({
          awb: "618-54405131",
          warehouse: "invalid",
          pcs: "20",
          kg: "100",
          confidence: 2,
          warnings: ["x"],
          injected: "không được đi qua",
        }),
      },
    );
    expect(result).toEqual(expect.objectContaining({
      awb: "618-54405131",
      warehouse: "",
      pcs: 20,
      kg: 100,
      confidence: 1,
    }));
    expect(result).not.toHaveProperty("injected");
  });

  it("profile image truyền inlineData nhưng output vẫn whitelist", async () => {
    let captured;
    const result = await parseProfileImage(
      { imageDataUrl: `data:image/png;base64,${Buffer.from("image").toString("base64")}` },
      {
        generate: async (options) => {
          captured = options.inlineData;
          return { name: "ACME", code: " ac me ", secret: "drop" };
        },
      },
    );
    expect(captured.mimeType).toBe("image/png");
    expect(result.code).toBe("ACME");
    expect(result).not.toHaveProperty("secret");
  });

  it("DIM chỉ giữ dòng số dương và divisor hợp lệ", async () => {
    const result = await parseDimText(
      { text: "40x30x20/2" },
      {
        generate: async () => ({
          lines: [
            { lCm: 40, wCm: 30, hCm: 20, pcs: 2 },
            { lCm: 0, wCm: 3, hCm: 4, pcs: 1 },
          ],
          divisor: 123,
        }),
      },
    );
    expect(result.lines).toEqual([{ lCm: 40, wCm: 30, hCm: 20, pcs: 2 }]);
    expect(result.divisor).toBe(6000);
  });

  it("checklist rule chạy deterministic trước Gemini", () => {
    expect(buildAnomalyRules({ awb: "618", flight: "", pcs: 0 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "awb", severity: "error" }),
        expect.objectContaining({ id: "flight" }),
        expect.objectContaining({ id: "pcs" }),
      ]),
    );
  });

  it("snapshot AI loại địa chỉ/điện thoại và aggregate không bịa", () => {
    const state = {
      rows: [{
        sessionDate: "2026-08-12",
        awb: "618-54405131",
        warehouse: "TCS",
        status: "RECEIVED",
        pcs: 2,
        kg: 10,
        phone: "0909",
        address: "secret",
      }],
    };
    const [row] = sanitizeOpsSnapshot(state, "2026-08-12");
    expect(row).not.toHaveProperty("phone");
    expect(row).not.toHaveProperty("address");
    expect(buildEndOfDayAggregate(state, "2026-08-12")).toEqual(
      expect.objectContaining({ shipments: 1, pcs: 2, kg: 10 }),
    );
  });
});
