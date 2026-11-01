import { describe, expect, it } from "vitest";
import { applyMutation, runMutation, setPostgresStateStore } from "./stateStore.mjs";

const empty = () => ({ version: 1, rows: [], customers: [] });
const add = (state) =>
  applyMutation(state, {
    action: "ADD",
    shipment: { sessionDate: "2026-11-01", awb: "", warehouse: "TCS" },
  });

describe("stateStore mutation queue", () => {
  it("never reuses the id of a deleted shipment", () => {
    let s = add(add(empty()));
    const deletedId = s.rows[1].id;
    s = applyMutation(s, { action: "DELETE", id: deletedId });
    s = add(s);
    expect(s.rows.map((r) => r.id)).not.toContain(deletedId);
  });

  it("runs the next mutation after a failed one (DB blip)", async () => {
    let calls = 0;
    setPostgresStateStore({
      key: "test",
      async runLocked(fn) {
        calls += 1;
        if (calls === 1) throw new Error("db down");
        const outcome = await fn(empty());
        return outcome.next;
      },
      // Old recovery path re-read state here; it must not be needed.
      async loadRawState() {
        throw new Error("db down");
      },
    });
    try {
      await expect(runMutation({ action: "DELETE", id: "x" })).rejects.toThrow("db down");
      const next = await runMutation({ action: "DELETE", id: "x" });
      expect(next.version).toBe(1);
      expect(calls).toBe(2);
    } finally {
      setPostgresStateStore(null);
    }
  });
});
