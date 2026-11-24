// Calibration for planning: per colonist-day, how many worker-hours of production (at speed 1, the ladder's unit) a
// bot colony actually delivers, and how much it eats and drinks. Usage: npx tsx tools/labor-yield.ts [runs=4] [days=40]
import { createWorld, tick, day, alive, TICKS_PER_HOUR } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { BUILDINGS, BASE_RATE, STAR_MULT, MEALS, DRINKS } from '../src/sim/content';

const runs = Number(process.argv[2] ?? 4), days = Number(process.argv[3] ?? 40);
// hours per unit for each building's recipe output
const hrs = new Map<string, number>();
for (const d of BUILDINGS) for (const r of d.recipes ?? []) hrs.set(`${r.output}:+${d.id}`, 1 / (BASE_RATE[r.output] * STAR_MULT[r.stars]));
const buckets = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 60]];
const agg = buckets.map(() => ({ cd: 0, prod: 0, meals: 0, drinks: 0, gather: 0, food: 0, wood: 0 }));
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919, w = createWorld(seed);
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  let prev: Record<string, number> = {}, prevEat = 0, prevDrink = 0;
  const sum = (o: Record<string, number>, pick: (k: string) => boolean) => Object.entries(o).filter(([k]) => pick(k)).reduce((n, [k, v]) => n + v * (hrs.get(k) ?? 0), 0);
  const eaten = () => MEALS.reduce((n, m) => n + (w.flows[`${m}:-eaten`] ?? 0), 0), drunk = () => DRINKS.reduce((n, m) => n + (w.flows[`${m}:-drunk`] ?? 0), 0);
  for (let d = 1; d <= days && w.status === 'playing'; d++) {
    for (let h = 0; h < 24; h++) {
      autoDecide(w, 'greedy', rand);
      for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
      autoBuild(w);
    }
    const b = buckets.findIndex(([a, z]) => d >= a && d <= z); if (b < 0) continue;
    const flows = { ...w.flows } as Record<string, number>;
    const delta: Record<string, number> = {};
    for (const k of Object.keys(flows)) delta[k] = flows[k] - (prev[k] ?? 0);
    const gatherers = new Set(BUILDINGS.filter(x => (x.recipes ?? []).every(rr => !Object.keys(rr.inputs).length)).map(x => x.id));
    agg[b].cd += alive(w).length;
    agg[b].prod += sum(delta, k => hrs.has(k));
    agg[b].gather += sum(delta, k => hrs.has(k) && gatherers.has(k.split(':+')[1]));
    agg[b].food += sum(delta, k => hrs.has(k) && (MEALS as string[]).includes(k.split(':+')[0])) + sum(delta, k => hrs.has(k) && ['berries','fish','mushrooms','grain','acorns','apples','honey','herbs','flour'].includes(k.split(':+')[0]));
    agg[b].wood += sum(delta, k => hrs.has(k) && ['wood','planks','bricks','wicker','clay','reeds'].includes(k.split(':+')[0]));
    agg[b].meals += eaten() - prevEat; agg[b].drinks += drunk() - prevDrink;
    prev = flows; prevEat = eaten(); prevDrink = drunk();
  }
  void day;
}
for (let b = 0; b < buckets.length; b++) {
  const a = agg[b]; if (!a.cd) continue;
  console.log(`days ${buckets[b][0]}-${buckets[b][1]}: production ${(a.prod / a.cd).toFixed(2)} h per colonist-day (gathering ${(a.gather / a.cd).toFixed(2)}; food chain ${(a.food / a.cd).toFixed(2)}, wood and materials ${(a.wood / a.cd).toFixed(2)}), meals ${(a.meals / a.cd).toFixed(2)}, drinks ${(a.drinks / a.cd).toFixed(2)} per colonist-day`);
}
