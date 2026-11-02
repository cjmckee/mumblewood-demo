// Watch one bot run closely: every few days, the colony size, trades and where they work, key stocks, the charter
// chain, the staffing plan and blocked workshops. Usage: npx tsx tools/watch-run.ts [seed=1000] [fromDay=15] [untilDay=60] [everyDays=3]
import { createWorld, tick, day, alive, avgMood, TICKS_PER_HOUR, built, workersAt, charterProgress, tallyOf, blockedReason } from '../src/sim/world';
import { autoDecide, autoBuild, charterChain, staffPlan } from '../src/sim/autoplayer';
import { enabledRecipes } from '../src/sim/world';
const seed = Number(process.argv[2] ?? 1000), from = Number(process.argv[3] ?? 15), until = Number(process.argv[4] ?? 60), every = Number(process.argv[5] ?? 3);
const w = createWorld(seed); let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
while (w.status === 'playing' && day(w) <= until) {
  autoDecide(w, 'greedy', rand);
  for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
  autoBuild(w);
  if (Math.round(w.hour) % 24 === 12 && day(w) >= from && (day(w) - from) % every === 0) {
    const jobs: Record<string, number> = {}; for (const b of built(w)) { const n = workersAt(w, b.uid).length; if (n) jobs[b.def] = (jobs[b.def] ?? 0) + n; }
    const tr: Record<string, number> = {}; for (const c of alive(w)) tr[c.trade ?? 'labor'] = (tr[c.trade ?? 'labor'] ?? 0) + 1;
    const blocked = built(w).filter(b => blockedReason(w, b)).map(b => `${b.def}: ${blockedReason(w, b)}`);
    console.log(`d${day(w)} pop ${alive(w).length} mood ${avgMood(w).toFixed(0)} ${w.charter} ${JSON.stringify(charterProgress(w))?.slice(0, 160)}\n   trades ${JSON.stringify(tr)} at ${JSON.stringify(jobs)}\n   res wood ${w.res.wood.toFixed(0)} planks ${w.res.planks.toFixed(0)} flour ${w.res.flour.toFixed(0)} bread ${w.res.bread.toFixed(0)} pie ${w.res.pie.toFixed(0)} berries ${w.res.berries.toFixed(0)} · sites ${w.buildings.filter(b => !b.built).map(b => b.def).join(',')} · owned ${w.owned.filter(o => !['stockpile','leanto','woodcutter','forager','desk','kitchen','dining','flowerbed','lantern','bench','statue','storehouse','clinic','cottage'].includes(o)).join(',')}\n   chain ${charterChain(w).join(",")} · kitchen recipes ${w.buildings.filter(b=>b.def==="kitchen").map(b=>enabledRecipes(b).map(r=>r.output).join("/")).join(" ")} · plan ${[...staffPlan(w)].filter(([,n])=>n).map(([u,n])=>w.buildings.find(b=>b.uid===u)!.def+":"+n).join(",")}\n   blocked ${blocked.join(' | ')}`);
  }
}
console.log(w.status, day(w));
