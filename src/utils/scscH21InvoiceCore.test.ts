import { describe, expect, it } from "vitest";
import {
  buildH21InvoiceNo,
  computeH21InvoiceFooter,
  createSeededRng,
  generateRandomH21InvoiceLines,
} from "../../shared/scscH21InvoiceCore.mjs";

describe("scscH21InvoiceCore", () => {
  it("buildH21InvoiceNo", () => {
    expect(
      buildH21InvoiceNo(
        { customerCode: "cc", flight: "sq185", flightDate: "03sep" },
        undefined
      )
    ).toBe("CC-SQ185/03SEP");
    expect(
      buildH21InvoiceNo(
        { customerCode: "cc", flight: "sq185", flightDate: "03sep" },
        undefined,
        { seq: 1, total: 1 }
      )
    ).toBe("CC-SQ185/03SEP");
    expect(
      buildH21InvoiceNo(
        { customerCode: "cc", flight: "sq185", flightDate: "03sep" },
        undefined,
        { seq: 2, total: 3 }
      )
    ).toBe("CC-SQ185/03SEP-2");
  });

  it("compute footer with declaration kg split", () => {
    const footer = computeH21InvoiceFooter(
      { kg: 850, pcs: 100 },
      [{ weightKg: 300, amount: 50, quantity: 10 }],
      { declarationKg: 400 }
    );
    expect(footer.grossKg).toBe(400);
    expect(footer.lotKg).toBe(850);
    expect(footer.residualKg).toBe(100);
    expect(footer.declarationPcs).toBe(47);
  });

  it("compute footer residual carton", () => {
    const footer = computeH21InvoiceFooter(
      { kg: 1000, pcs: 400 },
      [
        { weightKg: 850, amount: 100, quantity: 10 },
        { weightKg: 50, amount: 20, quantity: 5 },
      ]
    );
    expect(footer.grossKg).toBe(1000);
    expect(footer.linesKg).toBe(900);
    expect(footer.residualKg).toBe(100);
    expect(footer.totalCartonPkgs).toBe(40);
  });

  it("total carton is zero when no invoice lines", () => {
    const footer = computeH21InvoiceFooter({ kg: 3977, pcs: 329 }, []);
    expect(footer.grossKg).toBe(3977);
    expect(footer.linesKg).toBe(0);
    expect(footer.residualKg).toBe(3977);
    expect(footer.totalCartonPkgs).toBe(0);
  });

  it("generate random lines bounded by gross kg", () => {
    const catalog = [
      {
        id: "a",
        description: "Test bag",
        category: "BAG",
        hsCode: "123",
        origin: "VIETNAM",
        qty1: 10,
        uom1: "BAG",
        qty2: 0,
        uom2: "KGM",
        unitPrice: 1,
        amount: 10,
        unitFactor: 0.5,
        sortOrder: 0,
        warehouseScope: "SCSC",
        active: true,
      },
      {
        id: "b",
        description: "Test pce",
        category: "PCE",
        hsCode: "456",
        origin: "VIETNAM",
        qty1: 5,
        uom1: "PCE",
        qty2: 0,
        uom2: "KGM",
        unitPrice: 2,
        amount: 10,
        unitFactor: 1,
        sortOrder: 1,
        warehouseScope: "SCSC",
        active: true,
      },
    ];
    const rng = createSeededRng(42);
    const lines = generateRandomH21InvoiceLines({
      catalog,
      lineCount: 2,
      grossKg: 1000,
      rng,
    });
    expect(lines).toHaveLength(2);
    const sum = lines.reduce((a, l) => a + (l.weightKg || 0), 0);
    expect(sum).toBeLessThan(1000);
    expect(sum).toBeGreaterThan(0);
  });
});
