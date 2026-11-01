import { describe, expect, it } from "vitest";
import { replaceAllScscH21Goods } from "./scscH21Catalog.mjs";
import { replaceAllTcsH21Goods } from "./tcsH21Catalog.mjs";

function existingRow(scope) {
  return {
    id: "old-keep",
    category: "X",
    description: "Old keep",
    hs_code: "1",
    origin: "VIETNAM",
    qty1: 1,
    uom1: "PCE",
    qty2: 0,
    uom2: "KGM",
    unit_price: 1,
    amount: 1,
    unit_factor: 1,
    sort_order: 0,
    warehouse_scope: scope,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function catalogItem(id, description, scope) {
  return {
    id,
    description,
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
    sortOrder: 0,
    warehouseScope: scope,
    active: true,
  };
}

function makeTxClient({ scope, failOnInsert = 0 } = {}) {
  let rows = [existingRow(scope)];
  let snapshot = null;
  let insertCount = 0;
  const verbs = [];

  return {
    verbs,
    get rows() {
      return rows;
    },
    async query(sql) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      const upper = text.toUpperCase();
      if (upper === "BEGIN") {
        verbs.push("BEGIN");
        snapshot = structuredClone(rows);
        return { rows: [] };
      }
      if (upper === "COMMIT") {
        verbs.push("COMMIT");
        snapshot = null;
        return { rows: [] };
      }
      if (upper === "ROLLBACK") {
        verbs.push("ROLLBACK");
        if (snapshot) rows = snapshot;
        snapshot = null;
        return { rows: [] };
      }
      if (upper.includes("DELETE FROM")) {
        verbs.push("DELETE");
        rows = [];
        return { rows: [] };
      }
      if (upper.includes("INSERT INTO")) {
        verbs.push("INSERT");
        insertCount += 1;
        if (failOnInsert && insertCount >= failOnInsert) {
          const err = new Error("duplicate");
          err.code = "23505";
          throw err;
        }
        return { rows: [] };
      }
      if (upper.includes("SELECT")) {
        verbs.push("SELECT");
        return { rows };
      }
      return { rows: [] };
    },
  };
}

describe("replaceAll H21 goods transaction", () => {
  it("SCSC: insert lỗi sau DELETE thì ROLLBACK giữ catalog cũ", async () => {
    const client = makeTxClient({ scope: "SCSC", failOnInsert: 2 });
    await expect(
      replaceAllScscH21Goods(client, [
        catalogItem("n1", "New one", "SCSC"),
        catalogItem("n2", "New two", "SCSC"),
      ])
    ).rejects.toThrow(/mô tả trùng/i);
    expect(client.verbs[0]).toBe("BEGIN");
    expect(client.verbs).toContain("DELETE");
    expect(client.verbs).toContain("ROLLBACK");
    expect(client.verbs).not.toContain("COMMIT");
    expect(client.rows.map((r) => r.id)).toEqual(["old-keep"]);
  });

  it("TCS: insert lỗi sau DELETE thì ROLLBACK giữ catalog cũ", async () => {
    const client = makeTxClient({ scope: "TCS", failOnInsert: 2 });
    await expect(
      replaceAllTcsH21Goods(client, [
        catalogItem("n1", "New one", "TCS"),
        catalogItem("n2", "New two", "TCS"),
      ])
    ).rejects.toThrow(/mô tả trùng/i);
    expect(client.verbs[0]).toBe("BEGIN");
    expect(client.verbs).toContain("DELETE");
    expect(client.verbs).toContain("ROLLBACK");
    expect(client.verbs).not.toContain("COMMIT");
    expect(client.rows.map((r) => r.id)).toEqual(["old-keep"]);
  });

  it("SCSC: replace thành công COMMIT sau DELETE + insert", async () => {
    const client = makeTxClient({ scope: "SCSC" });
    await replaceAllScscH21Goods(client, [catalogItem("n1", "New one", "SCSC")]);
    expect(client.verbs[0]).toBe("BEGIN");
    expect(client.verbs).toContain("DELETE");
    expect(client.verbs).toContain("INSERT");
    expect(client.verbs.at(-1)).toBe("COMMIT");
    expect(client.verbs).not.toContain("ROLLBACK");
  });
});
