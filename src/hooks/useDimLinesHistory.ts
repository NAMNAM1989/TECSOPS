import { useCallback, useState } from "react";
import type { DimPieceLine } from "../utils/volumetricDim";

const DEFAULT_MAX_STEPS = 10;

function cloneLines(lines: DimPieceLine[]): DimPieceLine[] {
  return lines.map((l) => ({ ...l }));
}

function linesEqual(a: DimPieceLine[], b: DimPieceLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.lCm !== y.lCm ||
      x.wCm !== y.wCm ||
      x.hCm !== y.hCm ||
      x.pcs !== y.pcs ||
      Boolean(x.estimated) !== Boolean(y.estimated) ||
      Boolean(x.locked) !== Boolean(y.locked)
    ) {
      return false;
    }
  }
  return true;
}

type HistState = {
  lines: DimPieceLine[];
  undo: DimPieceLine[][];
  redo: DimPieceLine[][];
};

export type DimLinesHistoryApi = {
  lines: DimPieceLine[];
  setLines: (
    next: DimPieceLine[] | ((prev: DimPieceLine[]) => DimPieceLine[]),
  ) => void;
  /** Ghi đè không đẩy undo (seed / reset cứng). */
  replaceLines: (next: DimPieceLine[]) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
};

/** Undo/redo stack cho bảng DIM — tối đa `maxSteps` bước. */
export function useDimLinesHistory(
  initial: DimPieceLine[],
  maxSteps: number = DEFAULT_MAX_STEPS,
): DimLinesHistoryApi {
  const cap = Math.max(1, maxSteps);
  const [state, setState] = useState<HistState>(() => ({
    lines: cloneLines(initial),
    undo: [],
    redo: [],
  }));

  const setLines = useCallback(
    (next: DimPieceLine[] | ((prev: DimPieceLine[]) => DimPieceLine[])) => {
      setState((prev) => {
        const resolved = typeof next === "function" ? next(prev.lines) : next;
        if (linesEqual(prev.lines, resolved)) return prev;
        return {
          lines: cloneLines(resolved),
          undo: [...prev.undo, cloneLines(prev.lines)].slice(-cap),
          redo: [],
        };
      });
    },
    [cap],
  );

  const replaceLines = useCallback((next: DimPieceLine[]) => {
    setState({
      lines: cloneLines(next),
      undo: [],
      redo: [],
    });
  }, []);

  const undo = useCallback((): boolean => {
    let ok = false;
    setState((prev) => {
      if (!prev.undo.length) return prev;
      ok = true;
      const snapshot = prev.undo[prev.undo.length - 1]!;
      return {
        lines: snapshot,
        undo: prev.undo.slice(0, -1),
        redo: [...prev.redo, cloneLines(prev.lines)].slice(-cap),
      };
    });
    return ok;
  }, [cap]);

  const redo = useCallback((): boolean => {
    let ok = false;
    setState((prev) => {
      if (!prev.redo.length) return prev;
      ok = true;
      const snapshot = prev.redo[prev.redo.length - 1]!;
      return {
        lines: snapshot,
        redo: prev.redo.slice(0, -1),
        undo: [...prev.undo, cloneLines(prev.lines)].slice(-cap),
      };
    });
    return ok;
  }, [cap]);

  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, undo: [], redo: [] }));
  }, []);

  return {
    lines: state.lines,
    setLines,
    replaceLines,
    undo,
    redo,
    canUndo: state.undo.length > 0,
    canRedo: state.redo.length > 0,
    clearHistory,
  };
}
