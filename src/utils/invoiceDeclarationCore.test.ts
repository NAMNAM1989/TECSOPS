import { describe, expect, it } from "vitest";
import { emptyInvoiceLineItem } from "../types/invoiceItem";
import {
  applyTemplateStructure,
  autoDistributeItemsToDeclarations,
  copyItemsToDeclaration,
  countInvoiceLineItems,
  createInvoiceDeclaration,
  redistributeTargetsEvenly,
  resolveInvoiceDeclarations,
  splitIntoDeclarations,
  splitIntegerByWeights,
  validateDeclarationTargets,
  validateDeclarationsLock,
} from "./invoiceDeclarationCore";

describe("invoiceDeclarationCore", () => {
  it("resolveInvoiceDeclarations fallback invoiceItems", () => {
    const items = [emptyInvoiceLineItem({ description: "A" })];
    const list = resolveInvoiceDeclarations({ invoiceItems: items });
    expect(list).toHaveLength(1);
    expect(list[0]?.items[0]?.description).toBe("A");
  });

  it("countInvoiceLineItems ưu tiên invoiceDeclarations", () => {
    const items = [emptyInvoiceLineItem(), emptyInvoiceLineItem()];
    expect(countInvoiceLineItems({ invoiceItems: items })).toBe(2);
    expect(
      countInvoiceLineItems({
        invoiceItems: [emptyInvoiceLineItem()],
        invoiceDeclarations: [
          createInvoiceDeclaration(1, 2, [emptyInvoiceLineItem(), emptyInvoiceLineItem()]),
          createInvoiceDeclaration(2, 2, [emptyInvoiceLineItem()]),
        ],
      })
    ).toBe(3);
  });

  it("splitIntoDeclarations tạo N tờ với mục tiêu kiện/kg", () => {
    const list = splitIntoDeclarations(5, [], 100, 1000);
    expect(list).toHaveLength(5);
    expect(list[0]?.label).toBe("Tờ 1/5");
    expect(list[4]?.targetPcs).toBe(20);
    expect(list[4]?.targetKg).toBe(200);
  });

  it("splitIntegerByWeights giữ tổng", () => {
    expect(splitIntegerByWeights(100, [1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("autoDistributeItemsToDeclarations chia quantity", () => {
    const decls = splitIntoDeclarations(2, [], 10, 100);
    const templates = [emptyInvoiceLineItem({ quantity: 10, description: "X" })];
    const out = autoDistributeItemsToDeclarations(templates, decls);
    expect(out[0]?.items[0]?.quantity + (out[1]?.items[0]?.quantity ?? 0)).toBe(10);
  });

  it("applyTemplateStructure scale", () => {
    const d1 = createInvoiceDeclaration(1, 2, [emptyInvoiceLineItem({ quantity: 6 })], {
      targetPcs: 3,
    });
    const d2 = createInvoiceDeclaration(2, 2, [], { targetPcs: 3 });
    const out = applyTemplateStructure([d1, d2], d1.id, "scale");
    expect(out[0]?.items[0]?.quantity + (out[1]?.items[0]?.quantity ?? 0)).toBe(6);
  });

  it("copyItemsToDeclaration append", () => {
    const a = createInvoiceDeclaration(1, 2, [emptyInvoiceLineItem({ description: "A" })]);
    const b = createInvoiceDeclaration(2, 2, []);
    const out = copyItemsToDeclaration([a, b], a.id, b.id, [a.items[0]!.lineId], "append");
    expect(out[1]?.items).toHaveLength(1);
  });

  it("validateDeclarationsLock cảnh báo lệch", () => {
    const d = createInvoiceDeclaration(1, 1, [emptyInvoiceLineItem({ quantity: 5, kgPerUnit: 2 })]);
    const lock = validateDeclarationsLock([d], 10, 20);
    expect(lock.pcsOk).toBe(false);
    expect(lock.kgOk).toBe(false);
  });

  it("validateDeclarationTargets — tổng target khớp lô", () => {
    const list = splitIntoDeclarations(3, [], 50, 1000);
    const lock = validateDeclarationTargets(list, 50, 1000);
    expect(lock.pcsOk).toBe(true);
    expect(lock.kgOk).toBe(true);
    expect(lock.assignedPcs).toBe(50);
  });

  it("redistributeTargetsEvenly chia lại mục tiêu", () => {
    const list = [
      createInvoiceDeclaration(1, 3, [], { targetPcs: 1 }),
      createInvoiceDeclaration(2, 3, [], { targetPcs: 1 }),
      createInvoiceDeclaration(3, 3, [], { targetPcs: 1 }),
    ];
    const out = redistributeTargetsEvenly(list, 50, 1000);
    const lock = validateDeclarationTargets(out, 50, 1000);
    expect(lock.pcsOk).toBe(true);
    expect(lock.kgOk).toBe(true);
  });
});
