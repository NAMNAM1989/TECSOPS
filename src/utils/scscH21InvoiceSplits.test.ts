import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  createDeclSplit,
  declarationsReadyToSave,
  fingerprintH21Splits,
  hydrateSplitsFromShipment,
  normalizeLineCountDraft,
  parseAllocateKgFromDraft,
  splitsToDeclarations,
  sumAllocatedKg,
} from "./scscH21InvoiceSplits";

const baseShipment = {
  id: "s1",
  warehouse: "SCSC",
  kg: 100,
} as Shipment;

describe("parseAllocateKgFromDraft", () => {
  it("parses comma decimal and caps by lot kg", () => {
    expect(parseAllocateKgFromDraft("12,5", 100)).toBe(12.5);
    expect(parseAllocateKgFromDraft("200", 100)).toBe(100);
    expect(parseAllocateKgFromDraft("", 100)).toBe(0);
    expect(parseAllocateKgFromDraft("-1", 100)).toBe(0);
  });
});

describe("normalizeLineCountDraft", () => {
  it("clamps 1..50 and defaults empty", () => {
    expect(normalizeLineCountDraft("")).toBe("15");
    expect(normalizeLineCountDraft("0")).toBe("1");
    expect(normalizeLineCountDraft("99")).toBe("50");
    expect(normalizeLineCountDraft("8")).toBe("8");
  });
});

describe("hydrateSplitsFromShipment", () => {
  it("restores multi declarations with ids", () => {
    const shipment = {
      ...baseShipment,
      invoiceDeclarations: [
        {
          id: "d1",
          seq: 1,
          declarationKg: 40,
          cargoFamilyMode: "fruit" as const,
          lines: [
            {
              id: "l1",
              description: "Apple",
              hsCode: "1",
              origin: "VN",
              quantity: 1,
              uom: "PCE",
              weightKg: 1,
              unitPrice: 1,
              amount: 1,
            },
          ],
        },
        {
          id: "d2",
          seq: 2,
          declarationKg: 60,
          cargoFamilyMode: "auto" as const,
          lines: [],
        },
      ],
    } as Shipment;
    const splits = hydrateSplitsFromShipment(shipment);
    expect(splits).toHaveLength(2);
    expect(splits[0]?.id).toBe("d1");
    expect(splits[0]?.kgDraft).toBe("40");
    expect(splits[0]?.cargoFamilyMode).toBe("fruit");
    expect(splits[0]?.lines).toHaveLength(1);
    expect(splits[1]?.id).toBe("d2");
    expect(splits[1]?.lineCountDraft).toBe("15");
  });

  it("falls back to legacy invoiceItems", () => {
    const shipment = {
      ...baseShipment,
      invoiceItems: [
        {
          id: "l1",
          description: "X",
          hsCode: "",
          origin: "VN",
          quantity: 2,
          uom: "PCE",
          weightKg: 2,
          unitPrice: 1,
          amount: 2,
        },
      ],
    } as Shipment;
    const splits = hydrateSplitsFromShipment(shipment);
    expect(splits).toHaveLength(1);
    expect(splits[0]?.lines).toHaveLength(1);
    expect(splits[0]?.kgDraft).toBe("100");
    expect(splits[0]?.lineCountDraft).toBe("1");
  });
});

describe("declarationsReadyToSave", () => {
  it("filters empty tabs and reports skipped", () => {
    const splits = [
      createDeclSplit("40", {
        id: "a",
        lines: [
          {
            id: "l1",
            description: "A",
            hsCode: "",
            origin: "VN",
            quantity: 1,
            uom: "PCE",
            weightKg: 1,
            unitPrice: 1,
            amount: 1,
          },
        ],
      }),
      createDeclSplit("60", { id: "b", lines: [] }),
    ];
    const { declarations, skippedEmpty } = declarationsReadyToSave(splits, 100);
    expect(declarations).toHaveLength(1);
    expect(declarations[0]?.id).toBe("a");
    expect(skippedEmpty).toBe(1);
  });

  it("resequences seq after filter", () => {
    const splits = [
      createDeclSplit("10", { id: "empty", lines: [] }),
      createDeclSplit("20", {
        id: "keep",
        lines: [
          {
            id: "l1",
            description: "A",
            hsCode: "",
            origin: "VN",
            quantity: 1,
            uom: "PCE",
            weightKg: 1,
            unitPrice: 1,
            amount: 1,
          },
        ],
      }),
    ];
    const decls = splitsToDeclarations(splits, 100);
    expect(decls.map((d) => d.seq)).toEqual([1, 2]);
    const { declarations } = declarationsReadyToSave(splits, 100);
    expect(declarations[0]?.seq).toBe(1);
    expect(declarations[0]?.id).toBe("keep");
  });
});

describe("fingerprint + sumAllocatedKg", () => {
  it("detects dirty when lines change", () => {
    const a = [createDeclSplit("10", { id: "x", lines: [] })];
    const b = [
      createDeclSplit("10", {
        id: "x",
        lines: [
          {
            id: "l1",
            description: "A",
            hsCode: "",
            origin: "VN",
            quantity: 1,
            uom: "PCE",
            weightKg: 1,
            unitPrice: 1,
            amount: 1,
          },
        ],
      }),
    ];
    expect(fingerprintH21Splits(a, "ship")).not.toBe(fingerprintH21Splits(b, "ship"));
    expect(fingerprintH21Splits(a, "ship")).not.toBe(fingerprintH21Splits(a, "other"));
  });

  it("sums allocated kg", () => {
    const splits = [createDeclSplit("40"), createDeclSplit("35")];
    expect(sumAllocatedKg(splits, 100)).toBe(75);
  });
});
