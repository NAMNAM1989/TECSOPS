import { useCallback, useMemo, useState } from "react";
import {
  canRedo,
  canUndo,
  createHistory,
  historyCommit,
  historyRedo,
  historyUndo,
  type HistoryState,
} from "../core/historyManager";
import { bringForward, duplicateObject, removeObject, sendBackward, upsertObject } from "../core/objectManager";
import { snapMm } from "../core/snapGrid";
import type { LabelObject, LabelTemplateV1 } from "../core/types";

export function useDesignerState(initial: LabelTemplateV1) {
  const [history, setHistory] = useState<HistoryState>(() => createHistory(initial));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gridSnap, setGridSnap] = useState(true);
  const [gridMm, setGridMm] = useState(1);

  const template = history.present;
  const selected = useMemo(
    () => template.objects.find((o) => o.id === selectedId) ?? null,
    [template.objects, selectedId]
  );

  const commit = useCallback((next: LabelTemplateV1) => {
    setHistory((h) => historyCommit(h, next));
  }, []);

  const updateObject = useCallback(
    (obj: LabelObject) => {
      commit(upsertObject(template, obj));
    },
    [commit, template]
  );

  const patchSelected = useCallback(
    (patch: Partial<LabelObject>) => {
      if (!selected) return;
      updateObject({ ...selected, ...patch } as LabelObject);
    },
    [selected, updateObject]
  );

  const moveSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      const x = snapMm(selected.x + dx, gridMm, gridSnap);
      const y = snapMm(selected.y + dy, gridMm, gridSnap);
      updateObject({ ...selected, x, y } as LabelObject);
    },
    [selected, gridMm, gridSnap, updateObject]
  );

  const addObject = useCallback(
    (obj: LabelObject) => {
      commit(upsertObject(template, obj));
      setSelectedId(obj.id);
    },
    [commit, template]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(removeObject(template, selectedId));
    setSelectedId(null);
  }, [commit, template, selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const next = duplicateObject(template, selectedId);
    commit(next);
    const added = next.objects[next.objects.length - 1];
    if (added) setSelectedId(added.id);
  }, [commit, template, selectedId]);

  const reorderObject = useCallback(
    (id: string, dir: "up" | "down") => {
      commit(dir === "up" ? bringForward(template, id) : sendBackward(template, id));
    },
    [commit, template]
  );

  return {
    template,
    selected,
    selectedId,
    setSelectedId,
    gridSnap,
    setGridSnap,
    gridMm,
    setGridMm,
    commit,
    updateObject,
    patchSelected,
    moveSelected,
    addObject,
    deleteSelected,
    duplicateSelected,
    reorderObject,
    undo: () => setHistory((h) => historyUndo(h)),
    redo: () => setHistory((h) => historyRedo(h)),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    reset: (t: LabelTemplateV1) => setHistory(createHistory(t)),
  };
}
