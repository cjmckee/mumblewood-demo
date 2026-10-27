// Day-by-day trace of one bot run in any scenario: people, stock, jobs, research and charter progress.
// Usage: SCENARIO=frontier npx tsx tools/trace.ts [seed=1000] [days=40]
import { createWorld, tick, day, alive, avgMood, TICKS_PER_HOUR, World, built, workersAt, bdef, beds, charterProgress, stockOf, mealTotal, drinkTotal, laborers } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { envScenario } from '../src/sim/scenario';
const seed = Number(process.argv[2] ?? 1000), days = Number(process.argv[3] ?? 40);
const w: World = createWorld(seed, 'normal', envScenario());
let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
let logN = 0;
while (w.status === 'playing' && day(w) <= days) {
  autoDecide(w, 'greedy', rand);
  for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
  autoBuild(w);
  if (Math.round(w.hour) % 24 === 12) {
    const jobs = new Map<string, number>();
    for (const b of built(w)) if (bdef(b).slots) jobs.set(b.def, (jobs.get(b.def) ?? 0) + workersAt(w, b.uid).length);
    const p = charterProgress(w);
    console.log(`d${day(w)} pop ${alive(w).length}/${beds(w)}b lab ${laborers(w).length} mood ${Math.round(avgMood(w))} strain ${Math.round(w.strain)} · wood ${Math.floor(w.res.wood)} fine ${Math.floor(stockOf(w, 'fine'))} raw ${Math.floor(stockOf(w, 'rawFood'))} meals ${Math.floor(mealTotal(w))} drinks ${Math.floor(drinkTotal(w))} grain ${Math.floor(w.res.grain)} flour ${Math.floor(w.res.flour)} bread ${Math.floor(w.res.bread)}`);
    console.log(`    jobs ${[...jobs].map(([k, n]) => `${k}${n}`).join(' ')} · research ${w.research?.current ?? '-'} ${w.research ? Math.round(w.research.progress) : ''} · owned+ ${w.owned.filter(id => !['stockpile','leanto','woodcutter','forager','desk'].includes(id)).join(',')}`);
    if (p) console.log(`    charter ${p.charter.name}: ${p.label}`);
    if (process.env.LOG) { for (const l of w.log.slice(logN)) console.log(`      · ${l.text}`); logN = w.log.length; }
  }
}
console.log(w.status, day(w));
