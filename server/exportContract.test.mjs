import { describe, expect, it } from "vitest";
import {
  EXPORT_API_VERSION,
  EXPORT_SCHEMA_VERSION,
  buildExportEnvelope,
  decodeExportCursor,
  encodeExportCursor,
  etagMatches,
  exportEtag,
  normalizeExportWarehouse,
  parseExportLimit,
  parseExportView,
  parseSessionDateParam,
  toExportCustomerDto,
  toExportShipmentDto,
} from "./exportContract.mjs";

describe("exportContract", () => {
  it("chuẩn hóa warehouse + legacy KHO-*", () => {
    expect(normalizeExportWarehouse("tecs-tcs")).toBe("TECS-TCS");
    expect(normalizeExportWarehouse("KHO-SCSC")).toBe("TECS-SCSC");
    expect(normalizeExportWarehouse("nope", null)).toBeNull();
  });

  it("parse sessionDate / view / limit", () => {
    expect(parseSessionDateParam("2026-09-12")).toBe("2026-09-12");
    expect(parseSessionDateParam("12-09-2026")).toBeNull();
    expect(parseExportView("FULL")).toBe("full");
    expect(parseExportView("")).toBe("core");
    expect(parseExportLimit(99999)).toBe(2000);
    expect(parseExportLimit("0")).toBe(1);
  });

  it("cursor roundtrip", () => {
    const token = encodeExportCursor({
      sessionDate: "2026-09-12",
      warehouse: "TECS-TCS",
      stt: 3,
      id: "s-1",
    });
    expect(decodeExportCursor(token)).toEqual({
      sessionDate: "2026-09-12",
      warehouse: "TECS-TCS",
      stt: 3,
      id: "s-1",
    });
    expect(decodeExportCursor("@@@")).toBeNull();
  });

  it("DTO core không kèm field in ấn; full có", () => {
    const row = {
      id: "s-1",
      stt: 1,
      sessionDate: "2026-09-12",
      awb: "618-54405131",
      warehouse: "TECS-SCSC",
      status: "PENDING",
      shipperNamePrint: "ACME",
      invoiceItems: [{ sku: "A" }],
    };
    const core = toExportShipmentDto(row, "core");
    expect(core.awb).toBe("618-54405131");
    expect(core.warehouse).toBe("TECS-SCSC");
    expect(core).not.toHaveProperty("shipperNamePrint");
    expect(core).not.toHaveProperty("invoiceItems");

    const full = toExportShipmentDto(row, "full");
    expect(full.shipperNamePrint).toBe("ACME");
    expect(full.invoiceItems).toEqual([{ sku: "A" }]);
  });

  it("customer DTO + envelope + etag", () => {
    expect(toExportCustomerDto({ id: "c1", code: "ACME", name: "Acme" })).toEqual({
      id: "c1",
      code: "ACME",
      name: "Acme",
      syncedAt: null,
    });

    const body = buildExportEnvelope({
      resource: "shipments",
      stateVersion: 42,
      query: { sessionDate: "2026-09-12" },
      items: [{ id: "s-1" }],
      itemKey: "shipments",
      nextCursor: "abc",
      generatedAt: "2026-09-12T00:00:00.000Z",
    });
    expect(body).toMatchObject({
      ok: true,
      apiVersion: EXPORT_API_VERSION,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      stateVersion: 42,
      count: 1,
      nextCursor: "abc",
    });
    expect(body.shipments).toHaveLength(1);

    const etag = exportEtag(42);
    expect(etag).toBe('W/"tecsops-export-v42"');
    expect(etagMatches(etag, etag)).toBe(true);
    expect(etagMatches('"tecsops-export-v42"', etag)).toBe(true);
    expect(etagMatches('W/"other"', etag)).toBe(false);
  });
});
