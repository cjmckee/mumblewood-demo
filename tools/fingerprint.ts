// A hash of the whole world after the bot plays each seed, to prove a change didn't alter play.
// Usage: npx tsx tools/fingerprint.ts [seeds=8] [days=40]
import { createHash } from 'node:crypto';
import { createWorld, tick, day, TICKS_PER_HOUR } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
const N = Number(process.argv[2] ?? 8), DAYS = Number(process.argv[3] ?? 40);
for (let s = 0; s < N; s++) {
  const seed = 1000 + s, w = createWorld(seed);
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  while (w.status === 'playing' && day(w) <= DAYS) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
  }
  console.log(seed, w.status, day(w), createHash('sha1').update(JSON.stringify(w)).digest('hex').slice(0, 12));
}
