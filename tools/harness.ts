// Headless balance harness: plays N seeded runs with the auto-player and reports outcomes.
// Usage: npx tsx tools/harness.ts [runs=200] [maxDays=60] [style=greedy|random]
import { createWorld, tick, day, alive, avgMood, TICKS_PER_HOUR, World } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';

const runs = Number(process.argv[2] ?? 200);
const maxDays = Number(process.argv[3] ?? 60);
const style = (process.argv[4] ?? 'greedy') as 'greedy' | 'random';

interface Result { seed: number; status: string; day: number; pop: number; peak: number; charters: number; breakups: number; departures: number; moodByDay: number[] }
const results: Result[] = [];
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919;
  const w: World = createWorld(seed);
  let r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const moodByDay: number[] = [];
  while (w.status === 'playing' && day(w) <= maxDays) {
    autoDecide(w, style, rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, style, rand); }
    autoBuild(w);
    if (Math.round(w.hour) % 24 === 12) moodByDay.push(Math.round(avgMood(w)));
  }
  results.push({ seed, status: w.status === 'playing' ? 'timeout' : w.status, day: day(w), pop: alive(w).length, peak: w.stats.peakPop,
    charters: w.chartersDone.length, breakups: w.stats.breakups, departures: w.stats.departures, moodByDay });
}

const by = (s: string) => results.filter(r => r.status === s);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number) => `${Math.round((n / runs) * 100)}%`;
console.log(`runs=${runs} style=${style} maxDays=${maxDays}`);
for (const s of ['won', 'lost', 'timeout']) {
  const g = by(s);
  console.log(`${s.padEnd(8)} ${pct(g.length).padStart(4)}  avg day ${avg(g.map(r => r.day)).toFixed(1).padStart(5)}  avg peak pop ${avg(g.map(r => r.peak)).toFixed(1)}  charters ${avg(g.map(r => r.charters)).toFixed(2)}`);
}
console.log(`charters reached: 0=${pct(results.filter(r => r.charters === 0).length)} 1=${pct(results.filter(r => r.charters === 1).length)} 2=${pct(results.filter(r => r.charters === 2).length)} 3=${pct(results.filter(r => r.charters === 3).length)}`);
console.log(`avg breakups ${avg(results.map(r => r.breakups)).toFixed(1)}  avg departures ${avg(results.map(r => r.departures)).toFixed(1)}`);
const moodCurve: number[] = [];
for (let d = 0; d < maxDays; d++) { const xs = results.map(r => r.moodByDay[d]).filter(x => x != null); if (xs.length) moodCurve.push(Math.round(avg(xs))); }
console.log(`avg mood by day: ${moodCurve.join(' ')}`);
