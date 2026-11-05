import { createWorld, World } from '../src/sim/world';

/** Explicit presentation fixture, not a recorded playthrough. */
export function finalPreviewWorld(route: 'hall' | 'longtable' = 'hall'): World {
  const w = createWorld(4242);
  const original = w.colonists;
  w.colonists = Array.from({ length: 12 }, (_, i) => ({ ...structuredClone(original[i % original.length]), id: i + 1 }));
  w.nextColonistId = 13;
  w.name = 'Little Lantern'; w.named = true; w.hour = 24 * 71 + 6;
  w.chartersDone = ['settled', 'bread', route]; w.charter = null; w.charterTier = 3;
  w.decisions = []; w.status = 'won';
  Object.assign(w.stats, { peakPop: 14, built: 46, mealsEaten: 1128, couples: 7, breakups: 2, departures: 1, deaths: 1, errands: 12, cured: 19 });
  w.festival = { held: 4, called: false, readyAt: 0 };
  return w;
}
