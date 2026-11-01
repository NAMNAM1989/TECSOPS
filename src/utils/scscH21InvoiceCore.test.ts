import { describe, expect, it } from "vitest";
import {
  allocateH21InvoiceLinesFromItems,
  buildH21InvoiceNo,
  computeH21InvoiceFooter,
  createSeededRng,
  generateRandomH21InvoiceLines,
  resolveH21InvoiceNo,
  validateH21InvoiceExport,
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

  it("resolveH21InvoiceNo ưu tiên nhập tay", () => {
    expect(
      resolveH21InvoiceNo(
        " MY-INV-01 ",
        { customerCode: "cc", flight: "sq185", flightDate: "03sep" },
        undefined
      )
    ).toBe("MY-INV-01");
    expect(
      resolveH21InvoiceNo(
        "",
        { customerCode: "cc", flight: "sq185", flightDate: "03sep" },
        undefined
      )
    ).toBe("CC-SQ185/03SEP");
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

  it("compute footer total carton from lot pcs (not residual kg)", () => {
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
    expect(footer.totalCartonPkgs).toBe(400);
  });

  it("compute footer respects manual declarationPcs", () => {
    const footer = computeH21InvoiceFooter(
      { kg: 1000, pcs: 400 },
      [{ weightKg: 900, amount: 100, quantity: 10 }],
      { declarationPcs: 160 }
    );
    expect(footer.residualKg).toBe(100);
    expect(footer.totalCartonPkgs).toBe(160);
    expect(footer.declarationPcs).toBe(160);
  });

  it("total carton follows lot pcs even when no invoice lines", () => {
    const footer = computeH21InvoiceFooter({ kg: 3977, pcs: 329 }, []);
    expect(footer.grossKg).toBe(3977);
    expect(footer.linesKg).toBe(0);
    expect(footer.residualKg).toBe(3977);
    expect(footer.totalCartonPkgs).toBe(329);
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
    expect(sum).toBeLessThanOrEqual(1000);
    expect(sum).toBeGreaterThan(0);
  });

  it("allocate 15 dòng unitFactor=1 trên lô 5 kg không vượt 5 kg", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      id: `i${i}`,
      description: `Item ${i}`,
      category: "X",
      hsCode: "1",
      origin: "VIETNAM",
      qty1: 1,
      uom1: "PCE",
      qty2: 0,
      uom2: "KGM",
      unitPrice: 1,
      amount: 1,
      unitFactor: 1,
      sortOrder: i,
      warehouseScope: "SCSC",
      active: true,
    }));
    const lines = allocateH21InvoiceLinesFromItems({
      items,
      grossKg: 5,
      rng: () => 0.5,
    });
    const sum = lines.reduce((a, l) => a + (l.weightKg || 0), 0);
    expect(sum).toBeLessThanOrEqual(5);
    expect(lines.every((l) => (l.quantity || 0) >= 1)).toBe(true);
  });

  it("generateRandom 15 dòng unitFactor=1 trên lô 5 kg không vượt 5 kg", () => {
    const catalog = Array.from({ length: 15 }, (_, i) => ({
      id: `g${i}`,
      description: `Goods ${i}`,
      category: "X",
      hsCode: "1",
      origin: "VIETNAM",
      qty1: 1,
      uom1: "PCE",
      qty2: 0,
      uom2: "KGM",
      unitPrice: 1,
      amount: 1,
      unitFactor: 1,
      sortOrder: i,
      warehouseScope: "SCSC",
      active: true,
    }));
    const lines = generateRandomH21InvoiceLines({
      catalog,
      lineCount: 15,
      grossKg: 5,
      rng: createSeededRng(1),
    });
    const sum = lines.reduce((a, l) => a + (l.weightKg || 0), 0);
    expect(sum).toBeLessThanOrEqual(5);
  });

  it("validate chặn xuất khi Σ kg dòng > KG tờ khai", () => {
    const base = {
      shipment: { customerCode: "CC", flight: "SQ185", flightDate: "03SEP", kg: 5 },
      customerEntry: { code: "CC" },
      shipper: { shipperName: "Ship Co" },
      cnee: { name: "Cnee Co" },
    };
    const over = Array.from({ length: 15 }, () => ({ weightKg: 1, quantity: 1, amount: 1 }));
    const blocked = validateH21InvoiceExport({ ...base, lines: over });
    expect(blocked.some((e) => /vượt KG tờ khai/i.test(e))).toBe(true);

    const ok = validateH21InvoiceExport({
      ...base,
      lines: [{ weightKg: 4, quantity: 4, amount: 4 }],
    });
    expect(ok.filter((e) => /vượt KG tờ khai/i.test(e))).toEqual([]);

    const splitOver = validateH21InvoiceExport({
      ...base,
      shipment: { ...base.shipment, kg: 100 },
      declarationKg: 5,
      lines: [{ weightKg: 6, quantity: 6, amount: 6 }],
    });
    expect(splitOver.some((e) => /vượt KG tờ khai/i.test(e))).toBe(true);
  });

  it("random An An (250g/bag): weight = quantity × 0.25, không dùng qty2 lệch", () => {
    const catalog = [
      {
        id: "anan",
        description: "Bánh gạo An An, NSX: t7/2026, HSD: t7/2027 hàng mới 100% (250g/bag)",
        category: "BÁNH",
        hsCode: "19059090",
        origin: "VIETNAM",
        qty1: 150,
        uom1: "BAG",
        qty2: 16.65,
        uom2: "KGM",
        unitPrice: 0.7,
        amount: 105,
        unitFactor: 0.25,
        sortOrder: 0,
        warehouseScope: "SCSC",
        active: true,
      },
    ];
    const lines = generateRandomH21InvoiceLines({
      catalog,
      lineCount: 1,
      grossKg: 100,
      rng: createSeededRng(7),
      cargoFamily: "food",
    });
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line.weightKg).toBeCloseTo(line.quantity * 0.25, 5);
    expect(line.weightKg).not.toBe(16.65);
  });
});
