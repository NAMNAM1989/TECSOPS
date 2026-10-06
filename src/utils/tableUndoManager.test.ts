import { describe, it, expect } from "vitest";
import { TableUndoManager } from "./tableUndoManager";

describe("tableUndoManager", () => {
  it("pushes, undoes and redoes mutations with limit", () => {
    const mgr = new TableUndoManager(3);

    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);

    mgr.push({
      description: "Step 1",
      forwardMutations: [{ id: "1", action: "UPDATE", patch: { hawb: "A" } }],
      reverseMutations: [{ id: "1", action: "UPDATE", patch: { hawb: "OLD_A" } }],
    });

    mgr.push({
      description: "Step 2",
      forwardMutations: [{ id: "2", action: "UPDATE", patch: { hawb: "B" } }],
      reverseMutations: [{ id: "2", action: "UPDATE", patch: { hawb: "OLD_B" } }],
    });

    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);

    const undone = mgr.undo();
    expect(undone?.description).toBe("Step 2");
    expect(mgr.canRedo()).toBe(true);

    const redone = mgr.redo();
    expect(redone?.description).toBe("Step 2");
    expect(mgr.canRedo()).toBe(false);
  });

  it("drops oldest undo entries when exceeding maxEntries", () => {
    const mgr = new TableUndoManager(2);
    mgr.push({ description: "1", forwardMutations: [], reverseMutations: [] });
    mgr.push({ description: "2", forwardMutations: [], reverseMutations: [] });
    mgr.push({ description: "3", forwardMutations: [], reverseMutations: [] });

    expect(mgr.undo()?.description).toBe("3");
    expect(mgr.undo()?.description).toBe("2");
    expect(mgr.undo()).toBeUndefined(); // Entry 1 dropped
  });

  it("clears redo stack when new mutation pushed", () => {
    const mgr = new TableUndoManager(5);
    mgr.push({ description: "1", forwardMutations: [], reverseMutations: [] });
    mgr.undo();
    expect(mgr.canRedo()).toBe(true);
    mgr.push({ description: "2", forwardMutations: [], reverseMutations: [] });
    expect(mgr.canRedo()).toBe(false);
  });
});
