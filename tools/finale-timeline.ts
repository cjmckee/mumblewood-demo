// Where a finale's days go: picked → a route for each category owned → its workshops built → first unit made → bill
// stocked → done. Usage: npx tsx tools/finale-timeline.ts [runs=5] [maxDays=90]   (SEED_FROM like pacing.ts)
import { createWorld, tick, day, TICKS_PER_HOUR, World, built } from '../src/sim/world';
import { autoDecide, autoBuild, finaleRoutes, finaleOwed } from '../src/sim/autoplayer';
import { SLOTS, ResourceId } from '../src/sim/content';

const runs = Number(process.argv[2] ?? 5), maxDays = Number(process.argv[3] ?? 90);
type Cat = 'feastMeal' | 'feastDrink';
const CATS: Cat[] = ['feastMeal', 'feastDrink'];
const made = (w: World, goods: ResourceId[]) => goods.reduce((n, r) => n + Object.entries(w.flows).filter(([k]) => k.startsWith(`${r}:+`)).reduce((m, [, v]) => m + v, 0), 0);
const rows: string[] = [];
for (let i = 0; i < runs; i++) {
  const seed = 1000 + (i + Number(process.env.SEED_FROM ?? 0)) * 7919;
  const w = createWorld(seed);
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  let picked: number | null = null, finale = '';
  const at: Record<string, number | null> = {};
  const mark = (k: string, cond: boolean) => { if (cond && at[k] == null) at[k] = day(w); };
  let lastHour = -1, routeDesc: Record<string, string> = {};
  while (w.status === 'playing' && day(w) <= maxDays) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
    if (['hall', 'longtable'].includes(w.charter ?? '') && Math.floor(w.hour) !== lastHour) {
      lastHour = Math.floor(w.hour);
      if (picked == null) { picked = day(w); finale = w.charter!; }
      const routes = finaleRoutes(w), owed = finaleOwed(w);
      for (const c of CATS) {
        const route = routes.find(x => x.key === c);
        if (route) routeDesc[c] = `${route.good}(${[...new Set(route.steps.map(s => s.def))].join('+')})`;
        mark(`${c}:route`, !!route);
        mark(`${c}:built`, !!route && route.steps.every(s => built(w).some(b => b.def === s.def)));
        mark(`${c}:first`, made(w, SLOTS[c].members) > 0);
        mark(`${c}:stocked`, (owed[c] ?? 0) <= 0 && at[`${c}:first`] != null);
      }
    }
  }
  const rel = (k: string) => (at[k] == null || picked == null ? '  –' : String(at[k]! - picked).padStart(3));
  rows.push(`${seed} ${w.status.padEnd(7)} d${String(day(w)).padStart(2)} ${finale.padEnd(9)} picked d${picked ?? '–'} | ` +
    CATS.map(c => `${c === 'feastMeal' ? 'meal ' : 'drink'} route${rel(`${c}:route`)} built${rel(`${c}:built`)} first${rel(`${c}:first`)} stocked${rel(`${c}:stocked`)}`).join(' | ') +
    ` | done${w.status === 'won' && picked != null ? String(day(w) - picked).padStart(3) : '  –'} · ${CATS.map(c => routeDesc[c] ?? '?').join(', ')}`);
  console.log(rows.at(-1));
}
