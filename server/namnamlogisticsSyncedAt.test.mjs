import { describe, expect, it } from "vitest";
import { buildSyncMeta, overlaySyncedAtOnState } from "./namnamlogisticsSyncedAt.mjs";

describe("overlaySyncedAtOnState", () => {
  it("gắn lots và customers tách nguồn — không trộn max", () => {
    const state = {
      version: 1,
      rows: [
        {
          id: "r1",
          awb: "78420042005",
          warehouse: "TECS-TCS",
          sessionDate: "2026-08-21",
        },
      ],
      customers: [{ id: "c1", code: "GLO", name: "GLO" }],
    };
    const snapshot = {
      source: "namnamlogistics-rest",
      lots: [
        {
          awb_norm: "78420042005",
          warehouse: "TECS-TCS",
          session_date: "2026-08-21",
          synced_at: "2026-08-21T00:05:46.007Z",
        },
      ],
      customers: [{ code: "GLO", synced_at: "2026-08-22T17:23:35.982Z" }],
    };
    const next = overlaySyncedAtOnState(state, snapshot);
    expect(next.rows[0].syncedAt).toBe("2026-08-21T00:05:46.007Z");
    expect(next.customers[0].syncedAt).toBe("2026-08-22T17:23:35.982Z");
    expect(next.syncMeta.lotsMaxSyncedAt).toBe("2026-08-21T00:05:46.007Z");
    expect(next.syncMeta.customersMaxSyncedAt).toBe("2026-08-22T17:23:35.982Z");
    expect(next.syncMeta.lotsMaxSyncedAt).not.toBe(next.syncMeta.customersMaxSyncedAt);
    expect(next.syncMeta.lotsMaxSyncedAtByWarehouse["TECS-TCS"]).toBe(
      "2026-08-21T00:05:46.007Z"
    );
  });

  it("buildSyncMeta bỏ timestamp rác", () => {
    const meta = buildSyncMeta({
      source: "test",
      lots: [{ warehouse: "TCS", synced_at: "1970-01-01T00:00:00.000Z" }],
      customers: [{ code: "X", synced_at: null }],
    });
    expect(meta.lotsMaxSyncedAt).toBeNull();
    expect(meta.customersMaxSyncedAt).toBeNull();
  });
});
