// The stage ladder: every meal and drink sits at the stage its processing depth gives it, buildings stay small, morale
// buildings make nothing, and on every map each stage can be reached more than one way without any one building.
// npx tsx tools/ladder-check.ts
import assert from 'node:assert/strict';
import { BUILDINGS, MEAL_MOOD, DRINK_MOOD, TIER, TIER_MOOD, TIER_STAGE, TRADERS, membersOf, InputKey, ResourceId, SiteId, SITES, tradeable, CATEGORIES, MEALS, DRINKS, BASE_RATE, STAR_MULT, BuildingDef, GoodTier, RESOURCES } from '../src/sim/content';
import { createWorld, findSpot, apply, alive, runHours, reconcileStock, debugGrow, siteOk, comfortParts, World, Building, MEAL_TIER_COMFORT, SETTLEMENT_MEAL_COMFORT } from '../src/sim/world';

let n = 0; const ok = (cond: unknown, msg: string) => { assert(cond, msg); n++; };
const FOOD = [...MEALS, ...DRINKS];

// 1. Tiers: every meal and drink has one, and mood follows it.
ok(FOOD.every(r => TIER[r]), 'every meal and drink has a tier');
ok(MEALS.every(r => MEAL_MOOD[r] === TIER_MOOD[TIER[r]!]) && DRINKS.every(r => DRINK_MOOD[r] === TIER_MOOD[TIER[r]!]), 'meal and drink mood come from the tier');
ok((['stew', 'smokedFish', 'driedMushrooms'] as ResourceId[]).every(r => TIER[r] === 'processed' && MEAL_MOOD[r] === 1), 'processed meals are edible and give +1');
ok(MEALS.indexOf('banquet') < MEALS.indexOf('pie') && MEALS.indexOf('pie') < MEALS.indexOf('stew'), 'with no favourite, finer meals are eaten first');

// 2. The stage rule. One input processed once is a stage up; two or more combined are the larger of (deepest input + 1)
// and (the inputs' stages added up). Each good's stage is its shallowest recipe, and every recipe agrees with it.
const RAW = new Set(BUILDINGS.flatMap(d => (d.recipes ?? []).filter(r => !Object.keys(r.inputs).length).map(r => r.output)));
const stage: Partial<Record<ResourceId, number>> = Object.fromEntries([...RAW].map(r => [r, 0]));
const recipeStage = (inputs: Partial<Record<InputKey, number>>) => {
  const s = (Object.keys(inputs) as InputKey[]).map(k => Math.min(...membersOf(k).map(m => stage[m] ?? Infinity)));
  return s.length === 1 ? s[0] + 1 : Math.max(Math.max(...s) + 1, s.reduce((a, b) => a + b, 0));
};
for (let pass = 0; pass < 12; pass++) for (const d of BUILDINGS) for (const rec of d.recipes ?? []) {
  if (!Object.keys(rec.inputs).length) continue;
  const v = recipeStage(rec.inputs); if (v < (stage[rec.output] ?? Infinity)) stage[rec.output] = v;
}
for (const r of FOOD) ok(stage[r] === TIER_STAGE[TIER[r]!], `${r} is stage ${stage[r]}, as its tier (${TIER[r]}) says`);
const mismatched = BUILDINGS.flatMap(d => (d.recipes ?? []).filter(rec => Object.keys(rec.inputs).length && FOOD.includes(rec.output) && recipeStage(rec.inputs) !== stage[rec.output]).map(rec => `${d.id}:${rec.output}=${recipeStage(rec.inputs)}`));
ok(!mismatched.length, `every recipe lands on its good's stage${mismatched.length ? ': ' + mismatched.join(', ') : ''}`);
for (const t of ['simple', 'refined', 'quality'] as GoodTier[]) {
  ok(MEALS.filter(r => TIER[r] === t).length >= 2 && DRINKS.filter(r => TIER[r] === t).length >= 2, `at least two meals and two drinks are ${t}`);
}
ok(MEALS.filter(r => TIER[r] === 'magnificent').length >= 2, 'at least two magnificent meals');

// 3. Buildings stay small, and morale buildings make nothing.
const heavy = BUILDINGS.filter(d => (d.recipes ?? []).length > 4).map(d => d.id);
ok(!heavy.length, `no building has more than four recipes${heavy.length ? ': ' + heavy.join(', ') : ''}`);
ok(['tavern', 'bathhouse', 'stage', 'cottage'].every(id => !BUILDINGS.find(d => d.id === id)!.recipes), 'the tavern, bathhouse, stage and cottage make nothing');
// processing needs a draft: nothing the town starts with or studies grinds flour or mashes
ok(BUILDINGS.filter(d => (d.recipes ?? []).some(r => r.output === 'flour' || r.output === 'mash')).every(d => d.draftable), 'only drafted buildings grind flour or mash');

// 4. Every map. For each pair of sites, the fewest drafts and the labour to reach each stage, and no stage that any one
// drafted building gates. A route is a set of drafted buildings and the worker-hours a unit takes (walking left out).
const SITE_IDS = SITES.map(s => s.id);
type Route = { d: Set<string>; h: number };
function prune(list: Route[]) {
  const best = new Map<string, Route>();
  for (const c of list) { const k = [...c.d].sort().join('+'); if (!best.has(k) || best.get(k)!.h > c.h) best.set(k, c); }
  const xs = [...best.values()];
  return xs.filter(a => !xs.some(b => b !== a && b.d.size <= a.d.size && [...b.d].every(x => a.d.has(x)) && b.h <= a.h && (b.d.size < a.d.size || b.h < a.h)));
}
function routesOn(w: World, without?: string) {
  const memo = new Map<string, Route[]>();
  const routes = (good: ResourceId, depth = 7): Route[] => {
    const key = good + depth; if (memo.has(key)) return memo.get(key)!;
    if (depth < 0) return [];
    let out: Route[] = [];
    for (const d of BUILDINGS as BuildingDef[]) {
      if (d.id === without || !siteOk(w, d)) continue;
      for (const rec of d.recipes ?? []) {
        if (rec.output !== good) continue;
        let combos: Route[] = [{ d: new Set(d.draftable ? [d.id] : []), h: 1 / (BASE_RATE[rec.output] * STAR_MULT[rec.stars]) }];
        for (const [k, amt] of Object.entries(rec.inputs) as [InputKey, number][]) {
          const opts = membersOf(k).flatMap(m => routes(m, depth - 1));
          if (!opts.length) { combos = []; break; }
          combos = prune(combos.flatMap(c => opts.map(x => ({ d: new Set([...c.d, ...x.d]), h: c.h + amt * x.h }))));
        }
        out.push(...combos);
      }
    }
    out = prune(out); memo.set(key, out); return out;
  };
  return routes;
}
const STAGES: [string, ResourceId[]][] = [];
for (const kind of ['meal', 'drink'] as const) for (const t of ['simple', 'refined', 'quality', 'magnificent'] as GoodTier[]) {
  const goods = (kind === 'meal' ? MEALS : DRINKS).filter(r => TIER[r] === t);
  if (goods.length) STAGES.push([`${t} ${kind}`, goods]);
}
const table: Record<string, { min: number[]; hours: number[] }> = {};
const gates: string[] = [];
for (let i = 0; i < SITE_IDS.length; i++) for (let j = i + 1; j < SITE_IDS.length; j++) {
  const w = createWorld(3); w.sites = [SITE_IDS[i], SITE_IDS[j]] as SiteId[];
  const routes = routesOn(w);
  for (const [label, goods] of STAGES) {
    const rs = prune(goods.flatMap(g => routes(g)));
    ok(rs.length > 0, `${label} can be made on a ${w.sites.join('+')} map`);
    const row = (table[label] ??= { min: [], hours: [] });
    row.min.push(Math.min(...rs.map(r => r.d.size))); row.hours.push(Math.min(...rs.map(r => r.h)));
    // a building every route needs would gate the stage on this map
    const always = [...new Set(rs.flatMap(r => [...r.d]))].filter(d => rs.every(r => r.d.has(d)));
    if (always.length) gates.push(`${label} on ${w.sites.join('+')} needs ${always.join(', ')}`);
  }
}
ok(!gates.length, `no stage hangs on one building on any map${gates.length ? ': ' + gates.join('; ') : ''}`);
for (const [label, row] of Object.entries(table)) {
  ok(Math.min(...row.min) === Math.max(...row.min), `${label}: the same fewest drafts on every map (${[...new Set(row.min)].join(', ')})`);
  ok(Math.max(...row.hours) / Math.min(...row.hours) < 1.1, `${label}: labour within 10% across maps (${Math.min(...row.hours).toFixed(2)}–${Math.max(...row.hours).toFixed(2)} h)`);
}
console.log('fewest drafts per stage:', Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.min[0]])));
const meals = ['simple meal', 'refined meal', 'quality meal', 'magnificent meal'].map(k => table[k].min[0]);
ok(meals.every((m, i) => i === 0 || m >= meals[i - 1]), `meals never get easier to reach as they get finer (${meals.join(', ')})`);

// 5. Each route really runs.
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
const made = (w: World, r: ResourceId, at: string) => (w.flows[`${r}:+${at}`] ?? 0) > 1;
const used = (w: World, r: ResourceId, at: string) => (w.flows[`${r}:-${at}`] ?? 0) > 0;
{ const w = shop(5, 'forager', 2, {}); ok(made(w, 'acorns', 'forager'), 'any forager hut can gather acorns'); }
{ const w = shop(5, 'mill', 0, { acorns: 30, grain: 0, mushrooms: 0 }); ok(made(w, 'flour', 'mill') && used(w, 'acorns', 'mill'), 'the mill grinds acorns into flour'); }
{ const w = shop(5, 'malthouse', 2, { mushrooms: 30 }); ok(made(w, 'driedMushrooms', 'malthouse'), 'the malthouse dries mushrooms'); }
{ const w = shop(5, 'pieoven', 0, { bread: 20 }); ok(made(w, 'pie', 'pieoven') && used(w, 'bread', 'pieoven') && used(w, 'berries', 'pieoven'), 'a fruit pie from bread and berries'); }
{ const w = shop(5, 'smokehouse', 2, { driedMushrooms: 20, bread: 20, fish: 0, smokedFish: 0 }); ok(made(w, 'hotpot', 'smokehouse') && used(w, 'driedMushrooms', 'smokehouse'), 'hotpot from dried mushrooms and bread, with no fish'); }
{ const w = shop(5, 'stillhouse', 1, { cider: 20, herbs: 20 }); ok(made(w, 'mulled', 'stillhouse') && used(w, 'cider', 'stillhouse'), 'a mulled cup from cider and herbs at the still house'); }
{ const w = shop(5, 'smokehouse', 3, { skewers: 20, mulled: 20 }); ok(made(w, 'platter', 'smokehouse'), 'a braised platter from skewers and a mulled cup'); }

// 6. Comfort follows the tier of the last meal: steeply in a village, gently in a settlement.
{
  const w = createWorld(9); debugGrow(w, 4); w.chartersDone = ['a', 'b']; const c = alive(w)[0];
  c.hunger = 80; c.lastMeal = { cooked: true, table: true, loved: false, tier: 'quality' };
  const fine = comfortParts(w, c).meals!;
  c.lastMeal = { cooked: true, table: true, loved: false, tier: 'processed' };
  const plain = comfortParts(w, c).meals!;
  ok(fine === MEAL_TIER_COMFORT.quality && plain === MEAL_TIER_COMFORT.processed && fine > plain * 3, `a quality meal counts ${fine}, stew ${plain}`);
  c.lastMeal = { cooked: true, table: true, loved: false };
  ok(comfortParts(w, c).meals === MEAL_TIER_COMFORT.refined, 'a meal from an older save counts as refined');
  w.chartersDone = ['a']; c.lastMeal = { cooked: true, table: true, loved: false, tier: 'processed' };
  const stew1 = comfortParts(w, c).meals!; c.lastMeal = { cooked: true, table: true, loved: false, tier: 'quality' };
  ok(stew1 === SETTLEMENT_MEAL_COMFORT.processed && comfortParts(w, c).meals === 1, `a settlement is content with stew (${stew1}) and better fare is a bonus (${comfortParts(w, c).meals})`);
}

// 7. Traders never carry refined goods or better.
ok(TRADERS.every(t => t.sells.every(tradeable)), 'no trader lists a refined good or better');
ok(tradeable('flour') && tradeable('acorns') && tradeable('ale') && !tradeable('pie') && !tradeable('mulled'), 'raw goods, intermediates and simple drinks can be bought; refined goods cannot');
ok(RESOURCES.every(r => BASE_RATE[r.id] > 0), 'every good has a rate');

console.log(`ladder: ${n} checks passed`);
