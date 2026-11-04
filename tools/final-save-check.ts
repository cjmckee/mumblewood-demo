import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world';
import { saveWorld, loadSave, runResultKey } from '../src/save';
const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) } });
try {
  const w = createWorld(4242);
  w.status = 'won'; w.chartersDone = ['settled', 'bread', 'hall']; w.stats.mealsEaten = 431;
  assert(saveWorld(w));
  const loaded = loadSave()!.world;
  assert.equal(loaded.status, 'won'); assert.equal(loaded.stats.mealsEaten, 431);
  assert.equal(runResultKey(w), runResultKey(loaded), 'reload preserves the result identity');
  assert.equal(loaded.rngState, w.rngState);
  const next = createWorld(4243); saveWorld(next);
  assert.equal(loadSave()!.world.status, 'playing'); assert.equal(loadSave()!.world.seed, 4243);
  next.status = 'lost'; saveWorld(next); assert.equal(loadSave(), null);
  w.chartersDone = ['settled']; saveWorld(w); assert.equal(loadSave(), null, 'incomplete victories cannot resume');
  console.log('final results: winning save/resume, stable result identity, fresh settlement replacement and loss behavior passed');
} finally {
  if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage');
}
