import type { GradientState } from './GradientState';

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn();
}

/** Batch-mutate state then notify all subscribers once. */
export function patch(state: GradientState, changes: Partial<GradientState>) {
  Object.assign(state, changes);
  notify();
}
