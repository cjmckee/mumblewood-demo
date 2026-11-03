// Personal wants in bot runs: how often each kind is met, by standing, over the given seeds.
// Usage: npx tsx tools/wants-report.ts [runs=5] [maxDays=90]
import { createWorld, tick, day, alive, TICKS_PER_HOUR, wantMet, standingOf, STANDINGS } from '../src/sim/world';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
import { WANTS } from '../src/sim/content';
if (process.env.BOT_JSON) Object.assign(BOT, JSON.parse(process.env.BOT_JSON));
const runs = Number(process.argv[2] ?? 5), maxDays = Number(process.argv[3] ?? 90);
const tally: Record<string, [number, number][]> = {};
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919, w = createWorld(seed);
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  while (w.status === 'playing' && day(w) <= maxDays) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
    if (Math.round(w.hour) % 24 !== 12) continue;
    const st = standingOf(w);
    for (const c of alive(w)) for (const id of c.wants ?? []) { const row = (tally[id] ??= STANDINGS.map(() => [0, 0] as [number, number])); row[st][1]++; if (wantMet(w, c, id)) row[st][0]++; }
  }
}
console.log(`share of settler-days each want was met, by standing (${runs} runs)`);
console.log(`${''.padEnd(14)}${STANDINGS.map(s => s.padStart(12)).join('')}`);
for (const d of WANTS) console.log(`${d.name.padEnd(14)}${(tally[d.id] ?? []).map(([m, n]) => (n ? `${Math.round(m / n * 100)}%` : '–').padStart(12)).join('')}`);
