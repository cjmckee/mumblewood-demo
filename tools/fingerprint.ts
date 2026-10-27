// Determinism check: plays seeded bot runs and prints one hash of their end states.
// Run it before and after a change that should not alter a scenario's play; the hashes must match.
// Usage: npx tsx tools/fingerprint.ts [runs=20] [days=40]   (SCENARIO=classic by default)
import { createHash } from 'node:crypto';
import { createWorld, tick, day, TICKS_PER_HOUR, World } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import * as sim from '../src/sim/world';

const runs = Number(process.argv[2] ?? 20);
const maxDays = Number(process.argv[3] ?? 40);
const scenario = process.env.SCENARIO;
const all = createHash('sha256');
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919;
  const w: World = scenario ? (sim as any).createWorld(seed, 'normal', scenario) : createWorld(seed, 'normal');
  let r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  while (w.status === 'playing' && day(w) <= maxDays) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
  }
  const state = {
    status: w.status, hour: w.hour, rng: w.rngState, res: w.res, strain: w.strain, chartersDone: w.chartersDone, stats: w.stats,
    colonists: w.colonists.map(c => [c.name, c.job, Math.round(c.mood * 1000), c.left, c.died, c.skills]),
    buildings: w.buildings.map(b => [b.def, b.x, b.y, b.built]), log: w.log.map(l => (l as any).text ?? l),
  };
  const h = createHash('sha256').update(JSON.stringify(state)).digest('hex');
  all.update(h);
  if (process.env.VERBOSE) console.log(seed, w.status, day(w), h.slice(0, 12));
}
console.log(`runs=${runs} days=${maxDays} scenario=${scenario ?? 'default'} hash=${all.digest('hex').slice(0, 16)}`);
