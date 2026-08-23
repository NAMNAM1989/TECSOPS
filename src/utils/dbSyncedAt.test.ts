import { describe, expect, it } from "vitest";
import {
  SYNC_DISPLAY_TIME_ZONE,
  formatSyncClockIct,
  formatSyncedPhrase,
  maxCustomerSyncedAtMs,
  maxLotSyncedAtMs,
  mergeCustomerSyncedAt,
  mergeLotSyncedAt,
  parseSyncedAtMs,
  resolveCustomersSyncedAtMs,
  resolveOpsLotSyncedAtMs,
  toSyncedAtIso,
} from "./dbSyncedAt";

const SAIGON_SAMPLE = "2026-08-21T00:05:46.007Z";

describe("parseSyncedAtMs", () => {
  it("nhận ISO / Date / epoch ms hợp lệ", () => {
    expect(parseSyncedAtMs(SAIGON_SAMPLE)).toBe(Date.parse(SAIGON_SAMPLE));
    expect(parseSyncedAtMs(new Date(SAIGON_SAMPLE))).toBe(Date.parse(SAIGON_SAMPLE));
    expect(parseSyncedAtMs(Date.parse(SAIGON_SAMPLE))).toBe(Date.parse(SAIGON_SAMPLE));
  });

  it("ẩn epoch / Invalid Date / rỗng / 0", () => {
    expect(parseSyncedAtMs(null)).toBeNull();
    expect(parseSyncedAtMs(undefined)).toBeNull();
    expect(parseSyncedAtMs("")).toBeNull();
    expect(parseSyncedAtMs(0)).toBeNull();
    expect(parseSyncedAtMs("0")).toBeNull();
    expect(parseSyncedAtMs("Invalid Date")).toBeNull();
    expect(parseSyncedAtMs("not-a-date")).toBeNull();
    expect(parseSyncedAtMs(new Date(NaN))).toBeNull();
    expect(parseSyncedAtMs("1970-01-01T00:00:00.000Z")).toBeNull();
  });
});

describe("format ICT Asia/Saigon", () => {
  it("dùng Asia/Saigon và không bịa clock khi thiếu", () => {
    expect(SYNC_DISPLAY_TIME_ZONE).toBe("Asia/Saigon");
    expect(formatSyncClockIct(null)).toBe("");
    expect(formatSyncClockIct(0)).toBe("");
    expect(formatSyncClockIct("Invalid Date")).toBe("");
    // 00:05:46Z = 07:05:46 ICT
    expect(formatSyncClockIct(SAIGON_SAMPLE)).toBe("07:05:46");
    expect(formatSyncedPhrase(null)).toBe("");
    expect(formatSyncedPhrase(SAIGON_SAMPLE, Date.parse(SAIGON_SAMPLE))).toMatch(
      /^đã sync lúc 07:05:46/
    );
  });
});

describe("Ops lots ≠ Customers", () => {
  const lots = [
    {
      awb: "784-2004 2005",
      warehouse: "TECS-TCS",
      sessionDate: "2026-08-21",
      syncedAt: "2026-08-21T00:05:46.007Z",
    },
    {
      awb: "695-11111111",
      warehouse: "SCSC",
      sessionDate: "2026-08-21",
      syncedAt: "2026-08-20T10:00:00.000Z",
    },
  ];
  const customers = [
    { code: "GLO", syncedAt: "2026-08-22T17:23:35.982Z" },
  ];

  it("max lot theo kho đang xem — không lấy customers", () => {
    expect(maxLotSyncedAtMs(lots, { warehouse: "TECS-TCS" })).toBe(
      Date.parse("2026-08-21T00:05:46.007Z")
    );
    expect(maxCustomerSyncedAtMs(customers)).toBe(Date.parse("2026-08-22T17:23:35.982Z"));
    expect(
      resolveOpsLotSyncedAtMs({
        lots,
        warehouse: "TECS-TCS",
        sessionDate: "2026-08-21",
        warehouseMaxSyncedAt: "2026-08-21T00:05:46.007Z",
      })
    ).toBe(Date.parse("2026-08-21T00:05:46.007Z"));
    expect(
      resolveCustomersSyncedAtMs({
        customers,
        customersMaxSyncedAt: "2026-08-22T17:23:35.982Z",
      })
    ).toBe(Date.parse("2026-08-22T17:23:35.982Z"));
    expect(resolveOpsLotSyncedAtMs({ lots: [], warehouse: "TECS-TCS" })).toBeNull();
  });

  it("merge lot theo AWB+kho+ngày; merge khách theo code", () => {
    const mergedLots = mergeLotSyncedAt(
      [
        {
          id: "1",
          awb: "78420042005",
          warehouse: "TECS-TCS",
          sessionDate: "2026-08-21",
        },
      ],
      [
        {
          awb_norm: "78420042005",
          warehouse: "TECS-TCS",
          session_date: "2026-08-21",
          synced_at: SAIGON_SAMPLE,
        },
      ]
    );
    expect(mergedLots[0]?.syncedAt).toBe(toSyncedAtIso(SAIGON_SAMPLE));

    const mergedCus = mergeCustomerSyncedAt(
      [{ id: "c1", code: "glo", name: "GLO" }],
      [{ code: "GLO", synced_at: "2026-08-22T17:23:35.982Z" }]
    );
    expect(mergedCus[0]?.syncedAt).toBe(toSyncedAtIso("2026-08-22T17:23:35.982Z"));
  });
});
