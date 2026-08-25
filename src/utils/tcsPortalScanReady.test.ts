import { describe, expect, it } from "vitest";
import { pickEsidScanReadyItems, type TcsEsidScanItem } from "./tcsPortalAgentApi";

describe("pickEsidScanReadyItems", () => {
  it("chỉ lấy ready + RECEPTION_COMPLETED", () => {
    const ready: TcsEsidScanItem[] = [
      {
        awb: "73807183061",
        ready: true,
        normalized_status: "RECEPTION_COMPLETED",
        tcs_status: "Hoàn thành tiếp nhận",
      },
    ];
    const items: TcsEsidScanItem[] = [
      ...ready,
      {
        awb: "23218276370",
        ready: false,
        normalized_status: "NOT_COMPLETED",
        // Message lỗi từng chứa cụm «Hoàn thành tiếp nhận» → regex cũ gán ảo
        raw: "Không có trên danh sách Hoàn thành tiếp nhận (theo ngày)",
      },
    ];
    const picked = pickEsidScanReadyItems({ ready, items });
    expect(picked.map((r) => r.awb)).toEqual(["73807183061"]);
  });

  it("bỏ qua ready=true nhưng status sai", () => {
    const picked = pickEsidScanReadyItems({
      items: [
        {
          awb: "73807183061",
          ready: true,
          normalized_status: "NOT_COMPLETED",
          raw: "Hoàn thành tiếp nhận",
        },
      ],
    });
    expect(picked).toEqual([]);
  });
});
