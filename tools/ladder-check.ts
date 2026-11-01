// The goods ladder: tiers, the quality goods' slots and routes on every map, and that each route really produces.
// npx tsx tools/ladder-check.ts
import assert from 'node:assert/strict';
import { BUILDINGS, MEAL_MOOD, DRINK_MOOD, TIER, TIER_MOOD, TRADERS, membersOf, InputKey, ResourceId, SiteId, tradeable, CATEGORIES, MEALS } from '../src/sim/content';
import { createWorld, findSpot, apply, alive, runHours, reconcileStock, debugGrow, siteOk, comfortParts, World, Building, MEAL_TIER_COMFORT } from '../src/sim/world';

let n = 0; const ok = (cond: unknown, msg: string) => { assert(cond, msg); n++; };
const FINE: ResourceId[] = ['pie', 'hotpot', 'mulled'];

// 1. Tiers: every meal and drink has one, and mood follows it.
ok([...MEALS, ...CATEGORIES.drink.members].every(r => TIER[r]), 'every meal and drink has a tier');
ok(MEALS.every(r => MEAL_MOOD[r] === TIER_MOOD[TIER[r]!]) && CATEGORIES.drink.members.every(r => DRINK_MOOD[r] === TIER_MOOD[TIER[r]!]), 'meal and drink mood come from the tier');
ok(FINE.every(r => TIER[r] === 'quality'), 'pie, hotpot and the mulled cup are quality');
ok(MEALS.indexOf('pie') < MEALS.indexOf('stew') && MEALS.indexOf('hotpot') < MEALS.indexOf('bread'), 'with no favourite, finer meals are eaten first');

// 2. A quality good joins two chains: every recipe for one has at least two inputs, each from a different chain.
for (const r of FINE) for (const d of BUILDINGS) for (const rec of d.recipes ?? []) if (rec.output === r) {
  const keys = Object.keys(rec.inputs) as InputKey[];
  ok(keys.length >= 2 && keys.every(k => membersOf(k).length >= 2), `${d.id} makes ${r} from two slots with options`);
  ok(!membersOf(keys[0]).some(x => membersOf(keys[1]).includes(x)), `${d.id}'s ${r} slots don't overlap`);
}

// 3. Routes on every map: for each pair of sites, each quality good can be made at least two different ways.
const SITE_IDS: SiteId[] = ['grove', 'meadow', 'soil', 'clay'];
/** can something on this map make the good, all the way back to gatherers? */
function makeable(w: World, r: ResourceId, depth = 4): boolean {
  if (depth < 0) return false;
  return BUILDINGS.some(d => siteOk(w, d) && (d.recipes ?? []).some(rec => rec.output === r && (Object.keys(rec.inputs) as InputKey[]).every(k => membersOf(k).some(m => makeable(w, m, depth - 1)))));
}
/** distinct ways to make a quality good: building × the options chosen for each slot */
function routes(w: World, r: ResourceId) {
  const out = new Set<string>();
  for (const d of BUILDINGS) if (siteOk(w, d)) for (const rec of d.recipes ?? []) if (rec.output === r) {
    let combos: string[][] = [[]];
    for (const k of Object.keys(rec.inputs) as InputKey[]) combos = combos.flatMap(c => membersOf(k).filter(m => makeable(w, m)).map(m => [...c, m]));
    for (const c of combos) out.add(`${d.id}:${c.join('+')}`);
  }
  return out;
}
const fewest: Record<string, number> = {};
for (let i = 0; i < SITE_IDS.length; i++) for (let j = i + 1; j < SITE_IDS.length; j++) {
  const w = createWorld(3); w.sites = [SITE_IDS[i], SITE_IDS[j]];
  for (const r of FINE) {
    const k = routes(w, r).size, ways = new Set([...routes(w, r)].map(x => x.split(':')[1])).size;
    fewest[r] = Math.min(fewest[r] ?? 1e9, ways);
    ok(ways >= 2, `${r} on a ${w.sites.join('+')} map: ${ways} ingredient routes (${k} counting buildings)`);
  }
}
console.log('fewest ingredient routes on any map:', fewest);

// 4. Each route really runs: pie from acorn meal, hotpot from fish and flour, mulled cider with herbs.
function shop(seed: number, def: string, recipeOn: number, stock: Partial<Record<ResourceId, number>>) {
  const w = createWorld(seed); w.nextEventHour = 1e9; debugGrow(w, 6); if (!w.owned.includes(def)) w.owned.push(def);
  const spot = findSpot(w, def); assert(spot, `room for a ${def}`); assert.equal(apply(w, { type: 'place', def, ...spot }), null);
  const b = w.buildings.at(-1)! as Building; b.built = true; b.off = (BUILDINGS.find(d => d.id === def)!.recipes ?? []).map((_, i) => i).filter(i => i !== recipeOn);
  w.res.berries = 40; w.res.wood = 30; Object.assign(w.res, stock); reconcileStock(w);
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  apply(w, { type: 'assign', colonist: alive(w)[0].id, building: b.uid });
  for (let h = 0; h < 36; h++) { while (w.decisions.length) apply(w, { type: 'resolve', option: 99 }); runHours(w, 1); }
  return w;
}
{
  const w = shop(5, 'pieoven', 0, { acornMeal: 20, flour: 0 });
  ok((w.flows['pie:+pieoven'] ?? 0) > 2 && (w.flows['acornMeal:-pieoven'] ?? 0) > 0 && !(w.flows['wood:-pieoven'] ?? 0), 'pie from acorn meal and berries, and no wood');
}
{
  const w = shop(5, 'kitchen', 3, { fish: 20, flour: 20, mushrooms: 0 });
  ok((w.flows['hotpot:+kitchen'] ?? 0) > 2 && (w.flows['fish:-kitchen'] ?? 0) > 0 && (w.flows['flour:-kitchen'] ?? 0) > 0, 'hotpot from fish and flour at the kitchen');
}
{
  const w = shop(5, 'ciderpress', 3, { cider: 20, herbs: 20, berries: 0 });
  ok((w.flows['mulled:+ciderpress'] ?? 0) > 2 && (w.flows['cider:-ciderpress'] ?? 0) > 0 && (w.flows['herbs:-ciderpress'] ?? 0) > 0, 'a mulled cup from cider and herbs');
}
{
  const w = shop(5, 'forager', 2, {});
  ok((w.flows['acornMeal:+forager'] ?? 0) > 1, 'a forager can pound acorn meal');
}

// 5. Comfort at village standing follows the tier of the last meal.
{
  const w = createWorld(9); debugGrow(w, 4); w.chartersDone = ['a', 'b']; const c = alive(w)[0];
  c.hunger = 80; c.lastMeal = { cooked: true, table: true, loved: false, tier: 'quality' };
  const fine = comfortParts(w, c).meals!;
  c.lastMeal = { cooked: true, table: true, loved: false, tier: 'simple' };
  const plain = comfortParts(w, c).meals!;
  ok(fine === MEAL_TIER_COMFORT.quality && plain === MEAL_TIER_COMFORT.simple && fine > plain * 3, `a quality meal counts ${fine}, stew ${plain}`);
  c.lastMeal = { cooked: true, table: true, loved: false };
  ok(comfortParts(w, c).meals === MEAL_TIER_COMFORT.refined, 'a meal from an older save counts as refined');
  w.chartersDone = ['a']; c.lastMeal = { cooked: true, table: true, loved: false, tier: 'simple' };
  ok(comfortParts(w, c).meals! >= 0.85, 'before village standing, any cooked meal at a table counts as before');
}

// 6. Traders never carry quality goods.
ok(TRADERS.every(t => t.sells.every(tradeable)), 'no trader lists a quality good');
ok(FINE.every(r => !tradeable(r)) && tradeable('flour') && tradeable('acornMeal') && tradeable('ale'), 'raw goods, intermediates and refined drinks can be bought; quality goods cannot');

console.log(`ladder: ${n} checks passed`);
