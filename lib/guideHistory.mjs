// Undo / redo stack for the guide builder. Pure and immutable.
export const HISTORY_LIMIT = 50;

export function createHistory(present) {
  return { past: [], present, future: [] };
}

export function pushHistory(history, next, limit = HISTORY_LIMIT) {
  if (next === history.present) return history;
  return { past: [...history.past, history.present].slice(-limit), present: next, future: [] };
}

export function undoHistory(history) {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
}

export function redoHistory(history) {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}

// Replace the present without recording a step (e.g. live drag previews).
export function replacePresent(history, next) {
  return next === history.present ? history : { ...history, present: next };
}
