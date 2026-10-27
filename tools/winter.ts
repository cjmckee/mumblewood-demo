// What goes wrong around winter: stores, cold, sickness, mood and comfort on days either side of both winters, and every
// settler lost, by cause and by season. Usage: npx tsx tools/winter.ts [runs=30]
import { createWorld, tick, day, alive, TICKS_PER_HOUR, World, foodTotal, standingOf, colonyComfort, comfortGaps, avgMood } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { seasonOf } from '../src/sim/seasons';
const N = Number(process.argv[2] ?? 30);
const causes: Record<string, number> = {}, when: Record<string, number> = {};
const days = [12, 15, 18, 21, 24, 28, 45, 52, 56, 59, 62, 65];
const agg: Record<number, { n: number; food: number; wood: number; cold: number; sick: number; mood: number; pop: number; comfort: number; strain: number }> = {};
for (let i = 0; i < N; i++) {
  const w: World = createWorld(1000 + i * 7919);
  let r = 1000 + i; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  while (w.status === 'playing' && day(w) <= 70) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
    const d = day(w);
    if (Math.round(w.hour) % 24 === 12 && days.includes(d)) {
      const a = (agg[d] ??= { n: 0, food: 0, wood: 0, cold: 0, sick: 0, mood: 0, pop: 0, comfort: 0, strain: 0 });
      a.n++; a.food += foodTotal(w); a.wood += w.res.wood; a.cold += alive(w).filter(c => c.cold).length; a.sick += alive(w).filter(c => c.illness).length;
      a.mood += avgMood(w); a.pop += alive(w).length; a.comfort += colonyComfort(w); a.strain += w.strain;
    }
  }
  for (const l of w.log) {
    const m = l.text.match(/has died of ([^.]+)\./); const left = /wandered off into the woods/.test(l.text);
    if (m || left) { const k = m ? `died: ${m[1]}` : 'left'; causes[k] = (causes[k] ?? 0) + 1; const s = seasonOf({ hour: (l.day - 1) * 24 }); const kk = `${s.season}${s.season === 'winter' ? s.winter : ''}`; when[kk] = (when[kk] ?? 0) + 1; }
  }
}
console.log('day  runs  pop   food  wood  cold  sick  mood comfort strain');
for (const d of days) { const a = agg[d]; if (!a) continue; const f = (x: number) => (x / a.n).toFixed(1).padStart(5); console.log(`${String(d).padStart(3)} ${String(a.n).padStart(5)} ${f(a.pop)} ${f(a.food)} ${f(a.wood)} ${f(a.cold)} ${f(a.sick)} ${f(a.mood)} ${f(a.comfort * 100)} ${f(a.strain)}`); }
console.log('losses by cause', causes);
console.log('losses by season', when);
