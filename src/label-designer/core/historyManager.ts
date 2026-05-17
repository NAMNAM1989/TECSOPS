import type { LabelTemplateV1 } from "./types";

export type HistoryState = {
  past: LabelTemplateV1[];
  present: LabelTemplateV1;
  future: LabelTemplateV1[];
};

const MAX_HISTORY = 80;

export function createHistory(initial: LabelTemplateV1): HistoryState {
  return { past: [], present: initial, future: [] };
}

export function historyCommit(state: HistoryState, next: LabelTemplateV1): HistoryState {
  const past = [...state.past, state.present].slice(-MAX_HISTORY);
  return { past, present: next, future: [] };
}

export function historyUndo(state: HistoryState): HistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, MAX_HISTORY),
  };
}

export function historyRedo(state: HistoryState): HistoryState {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    present: next,
    future: state.future.slice(1),
  };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}
