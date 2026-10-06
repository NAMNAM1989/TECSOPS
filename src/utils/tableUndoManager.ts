import { UNDO_LIMIT } from "../config/tableUx";
import type { ShipmentMutation } from "./shipmentMutations";

export interface UndoEntry {
  id: string;
  description: string;
  timestamp: number;
  forwardMutations: ShipmentMutation[];
  reverseMutations: ShipmentMutation[];
}

export class TableUndoManager {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private limit: number;

  constructor(limit = UNDO_LIMIT) {
    this.limit = limit;
  }

  public push(entry: Omit<UndoEntry, "id" | "timestamp">): UndoEntry {
    const fullEntry: UndoEntry = {
      ...entry,
      id: `undo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.undoStack.push(fullEntry);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    // Khi người dùng thực hiện thao tác mới, xóa redo stack
    this.redoStack = [];
    return fullEntry;
  }

  public undo(): UndoEntry | undefined {
    const entry = this.undoStack.pop();
    if (entry) {
      this.redoStack.push(entry);
    }
    return entry;
  }

  public redo(): UndoEntry | undefined {
    const entry = this.redoStack.pop();
    if (entry) {
      this.undoStack.push(entry);
    }
    return entry;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export const globalTableUndoManager = new TableUndoManager();
