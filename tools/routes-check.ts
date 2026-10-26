// Forces each drink route on a map that has its site, staffs it, and checks the drinks come out of the right recipe.
// Also checks: flower beds raise an apiary's output; maps never offer a gatherer for a site they lack.
// Usage: npx tsx tools/routes-check.ts
import { createWorld, apply, runHours, findSpot, built, workersAt, alive, World, efficiencyAt, currentRecipe, canPlace } from '../src/sim/world';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

/** first seed whose map has the site */
function worldWith(site: string): World {
  for (let s = 1; s < 500; s++) { const w = createWorld(s * 101, 'normal'); if (w.sites.includes(site as any)) { while (w.decisions.length) apply(w, { type: 'resolve', option: 0 }); return w; } }
  throw new Error('no map with ' + site);
}
function put(w: World, id: string, nearGood = true) {
  if (!w.owned.includes(id)) w.owned.push(id);
  const spot = findSpot(w, id);
  if (!spot) throw new Error('no spot for ' + id);
  if (apply(w, { type: 'place', def: id, x: spot.x, y: spot.y })) throw new Error('could not place ' + id);
  const b = w.buildings[w.buildings.length - 1]; b.built = true; void nearGood;
  return b;
}
function staff(w: World, b: ReturnType<typeof put>, n: number) {
  const free = alive(w).filter(c => c.job == null).slice(0, n);
  for (const c of free) apply(w, { type: 'assign', colonist: c.id, building: b.uid });
  return workersAt(w, b.uid).length;
}
const made = (w: World, key: string) => w.flows[key] ?? 0;
/** run the clock, waving through any decision that comes up (the world pauses while one is waiting) */
function run(w: World, hours: number) { for (let h = 0; h < hours; h++) { while (w.decisions.length) apply(w, { type: 'resolve', option: 99 }); runHours(w, 1); } }

const routes: { site: string; gatherer: string; maker: string; drink: string; input: string }[] = [
  { site: 'soil', gatherer: 'field', maker: 'brewery', drink: 'ale', input: 'grain' },
  { site: 'grove', gatherer: 'orchard', maker: 'ciderpress', drink: 'cider', input: 'apples' },
  { site: 'meadow', gatherer: 'apiary', maker: 'brewery', drink: 'mead', input: 'honey' },
];
for (const r of routes) {
  const w = worldWith(r.site);
  const g = put(w, r.gatherer), m = put(w, r.maker);
  check(g.eff > 0.3, `${r.gatherer} on ${r.site}: works at ${Math.round(g.eff * 100)}% (${efficiencyAt(w, g.def, g.x, g.y).label})`);
  // start everyone as a laborer so the route gets its workers (the opening auto-assign fills the woodcutter and forager)
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  const ng = staff(w, g, 2), nm = staff(w, m, 2);
  check(ng >= 1 && nm === 2, `${ng} on the ${r.gatherer}, ${nm} on the ${r.maker}`);
  run(w, 72);
  const out = made(w, `${r.drink}:+${r.maker}`), used = made(w, `${r.input}:-${r.maker}`);
  check(out > 5 && used > 5, `${r.maker} turned ${used.toFixed(0)} ${r.input} into ${out.toFixed(0)} ${r.drink} in 3 days`);
  check(currentRecipe(w, m)?.output === r.drink, `${r.maker} is on its ${r.drink} recipe while ${r.input} comes in`);
}

// berry fallback: a brewery with no grain or honey makes ★ berry ale, the press ★★ berry ale for fewer berries
{
  const w = worldWith('grove');
  const b = put(w, 'brewery'), p = put(w, 'ciderpress');
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  staff(w, b, 1); staff(w, p, 1);
  run(w, 48);
  const brewAle = made(w, 'ale:+brewery'), pressAle = made(w, 'ale:+ciderpress');
  const brewPer = made(w, 'berries:-brewery') / Math.max(0.01, brewAle), pressPer = made(w, 'berries:-ciderpress') / Math.max(0.01, pressAle);
  check(brewAle > 0 && pressAle > 0, `both make berry ale without grain (${brewAle.toFixed(1)} vs ${pressAle.toFixed(1)})`);
  check(Math.abs(brewPer - 3) < 0.05 && Math.abs(pressPer - 2.5) < 0.05, `berries per ale: brewery ${brewPer.toFixed(2)} (★), press ${pressPer.toFixed(2)} (★★)`);
}

// flower beds count as meadow for an apiary: try it on a map with no meadow at all
{
  let w = createWorld(7, 'normal');
  for (let s = 1; w.sites.includes('meadow'); s++) w = createWorld(s * 13, 'normal');
  while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
  const a = put(w, 'apiary'); const before = a.eff;
  for (let i = 0; i < 3; i++) {
    let done = false;
    for (let dx = -2; dx <= 2 && !done; dx++) for (let dy = -2; dy <= 2 && !done; dy++) if (canPlace(w, 'flowerbed', a.x + dx, a.y + dy).ok) {
      apply(w, { type: 'place', def: 'flowerbed', x: a.x + dx, y: a.y + dy }); done = true;
    }
  }
  w.res.wood += 20;
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  run(w, 24);
  const beds = w.buildings.filter(b => b.def === 'flowerbed' && b.built).length;
  check(beds >= 2 && a.eff > before, `${beds} flower beds raise a meadowless apiary from ${Math.round(before * 100)}% to ${Math.round(a.eff * 100)}%`);
}

// a map without a site never offers its gatherer
{
  let offered = 0, maps = 0;
  for (let s = 1; s < 80; s++) {
    const w = createWorld(s * 37, 'normal');
    const missing = (['soil', 'grove', 'meadow'] as const).find(x => !w.sites.includes(x))!;
    const gatherer = { soil: 'field', grove: 'orchard', meadow: 'apiary' }[missing];
    maps++;
    for (let h = 0; h < 24 * 20 && w.status === 'playing'; h++) {
      for (const d of w.decisions) if (d.kind === 'blueprint' && d.options.includes(gatherer)) offered++;
      while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
      runHours(w, 1);
    }
  }
  check(offered === 0, `over ${maps} maps × 20 days, a gatherer for a missing site was offered ${offered} times`);
}
void built;
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
