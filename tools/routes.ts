// Which production routes do colonies actually use? Per run: map sites, drink makers and gatherers built, drinks made by
// kind and building, and how much each input fed them. Usage: npx tsx tools/routes.ts [runs=60]
import { createWorld, tick, day, TICKS_PER_HOUR, World, built } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { CATEGORIES } from '../src/sim/content';

const runs = Number(process.argv[2] ?? 60);
const drinks = CATEGORIES.drink.members;
const pct = (n: number) => `${Math.round((n / runs) * 100)}%`;
const bySites: Record<string, { n: number; won: number }> = {};
const routeCount: Record<string, number> = {};
const madeBy: Record<string, number> = {};
let tavernBuilt = 0, anyDrink = 0, won = 0;
const builtCount: Record<string, number> = {};
const drunkDays: number[] = [];

for (let i = 0; i < runs; i++) {
  const w: World = createWorld(1000 + i * 7919);
  let hoursWithDrink = 0, tavernHours = 0;
  while (w.status === 'playing' && day(w) <= 90) {
    autoDecide(w);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w); }
    autoBuild(w);
    if (built(w).some(b => b.def === 'tavern')) { tavernHours++; if (drinks.some(d => w.res[d] >= 1)) hoursWithDrink++; }
  }
  const key = (w.sites ?? []).join('+') || 'none';
  bySites[key] ??= { n: 0, won: 0 }; bySites[key].n++; if (w.status === 'won') { bySites[key].won++; won++; }
  for (const id of new Set(built(w).map(b => b.def))) builtCount[id] = (builtCount[id] ?? 0) + 1;
  if (built(w).some(b => b.def === 'tavern')) { tavernBuilt++; drunkDays.push(tavernHours ? hoursWithDrink / tavernHours : 0); }
  // the run's main drink route: the drink-and-building pair that made the most
  let best = '', bestN = 0, total = 0;
  for (const [k, v] of Object.entries(w.flows)) {
    const [res, src] = k.split(':');
    if (!drinks.includes(res as any) || !src.startsWith('+')) continue;
    madeBy[`${res} at ${src.slice(1)}`] = (madeBy[`${res} at ${src.slice(1)}`] ?? 0) + v / runs; total += v;
    if (v > bestN) { bestN = v; best = `${res} at ${src.slice(1)}`; }
  }
  // what fed the drink makers
  for (const [k, v] of Object.entries(w.flows)) { const [res, src] = k.split(':'); if (src === '-brewery' || src === '-ciderpress') madeBy[`  ${res} into ${src.slice(1)}`] = (madeBy[`  ${res} into ${src.slice(1)}`] ?? 0) + v / runs; }
  if (total > 1) anyDrink++;
  routeCount[best || 'none'] = (routeCount[best || 'none'] ?? 0) + 1;
}
console.log(`runs=${runs}: won ${pct(won)} · tavern built ${pct(tavernBuilt)} · made any drink ${pct(anyDrink)} · tavern had a drink in store ${Math.round((drunkDays.reduce((a, b) => a + b, 0) / Math.max(1, drunkDays.length)) * 100)}% of its hours`);
console.log('\nmap sites          runs  won');
for (const [k, v] of Object.entries(bySites).sort()) console.log(`${k.padEnd(18)} ${String(v.n).padStart(4)}  ${Math.round((v.won / v.n) * 100)}%`);
console.log('\nmain drink route (most made)   runs');
for (const [k, v] of Object.entries(routeCount).sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(30)} ${pct(v).padStart(5)}`);
console.log('\nmade per run (and inputs used)');
for (const [k, v] of Object.entries(madeBy).sort()) console.log(`${k.padEnd(30)} ${v.toFixed(0).padStart(5)}`);
console.log('\nbuilt in % of runs: ' + ['brewery', 'ciderpress', 'orchard', 'field', 'apiary', 'tavern', 'sawmill', 'pieoven', 'cottage'].map(id => `${id} ${pct(builtCount[id] ?? 0)}`).join(' · '));
