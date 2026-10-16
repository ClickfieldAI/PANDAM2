/**
 * Live registry of mounted tour targets. `<TourTarget>` registers a handle on
 * mount; the provider asks it to measure (in window coordinates, so it is
 * independent of nesting, scrolling and screen size) when a step needs it.
 */
import type { TourTargetId } from './steps';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetHandle {
  measure: () => Promise<Rect | null>;
  /** Scrolls the target's screen so it is visible (no-op if not scrollable). */
  scrollIntoView: () => Promise<void>;
}

const targets = new Map<TourTargetId, TargetHandle>();

export const tourRegistry = {
  register(id: TourTargetId, handle: TargetHandle) {
    targets.set(id, handle);
    return () => {
      if (targets.get(id) === handle) targets.delete(id);
    };
  },
  get: (id: TourTargetId) => targets.get(id),
};
