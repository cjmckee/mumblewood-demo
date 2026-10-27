// Per-charter report: how often the bot picks each charter, finishes it, and how many days it takes.
// Usage: npx tsx tools/charters.ts [runs=150]
import { createWorld, tick, day, TICKS_PER_HOUR } from '../src/sim/world';
import { CHARTERS } from '../src/sim/content';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';

const runs = Number(process.argv[2] ?? 150);
const stat: Record<string, { picked: number; done: number; days: number[] }> = {};
let wins = 0; const winDays: number[] = [];
for (let i = 0; i < runs; i++) {
  const w = createWorld(1000 + i * 7919);
  let cur: string | null = null, since = 0;
  while (w.status === 'playing' && day(w) <= 90) {
    autoDecide(w);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); autoDecide(w); }
    autoBuild(w);
    if (w.charter !== cur) {
      if (cur && w.chartersDone.includes(cur)) { stat[cur].done++; stat[cur].days.push((w.hour - since) / 24); }
      cur = w.charter; since = w.hour;
      if (cur) (stat[cur] ??= { picked: 0, done: 0, days: [] }).picked++;
    }
  }
  if (cur && w.chartersDone.includes(cur)) { stat[cur].done++; stat[cur].days.push((w.hour - since) / 24); }
  if (w.status === 'won') { wins++; winDays.push(day(w)); }
}
const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
console.log(`${runs} runs: won ${Math.round(wins / runs * 100)}%, median winning day ${med(winDays)}`);
console.log('charter       tier  picked  finished  median days');
for (const c of CHARTERS) {
  const s = stat[c.id]; if (!s) { console.log(`${c.id.padEnd(13)} ${c.tier}     never picked`); continue; }
  console.log(`${c.id.padEnd(13)} ${c.tier}    ${String(s.picked).padStart(5)}  ${String(Math.round(s.done / s.picked * 100) + '%').padStart(7)}  ${med(s.days).toFixed(1).padStart(10)}`);
}
