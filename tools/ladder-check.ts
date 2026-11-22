// The flat ladder: every meal sits at the stage its processing depth gives it, each building has one role, morale
// buildings make nothing, and on every map each stage can be reached more than one way without any one building.
// npx tsx tools/ladder-check.ts
import assert from 'node:assert/strict';
import { BUILDINGS, MEAL_MOOD, DRINK_MOOD, TIER, TIER_MOOD, TIER_STAGE, TIER_RANK, TRADERS, membersOf, InputKey, ResourceId, SiteId, SITES, tradeable, CATEGORIES, MEALS, DRINKS, BASE_RATE, STAR_MULT, BuildingDef, GoodTier, RESOURCES } from '../src/sim/content';
import { createWorld, DRINK_SITES, findSpot, apply, alive, runHours, reconcileStock, debugGrow, siteOk, World, Building } from '../src/sim/world';

let n = 0; const ok = (cond: unknown, msg: string) => { assert(cond, msg); n++; };
const FOOD = [...MEALS, ...DRINKS];

// 1. Tiers: every meal and drink has one, and mood follows it. Meals come plain, good and quality; drinks plain and quality.
ok(FOOD.every(r => TIER[r]), 'every meal and drink has a tier');
ok(MEALS.every(r => MEAL_MOOD[r] === TIER_MOOD[TIER[r]!]) && DRINKS.every(r => DRINK_MOOD[r] === TIER_MOOD[TIER[r]!]), 'meal and drink mood come from the tier');
ok((['stew', 'smokedFish', 'driedMushrooms'] as ResourceId[]).every(r => TIER[r] === 'plain'), 'stew, smoked fish and dried mushrooms are plain');
ok(DRINKS.every(r => TIER[r] !== 'good'), 'drinks are plain or quality');
ok(MEALS.indexOf('banquet') < MEALS.indexOf('pie') && MEALS.indexOf('pie') < MEALS.indexOf('stew'), 'with no favourite, finer meals are eaten first');
for (const t of ['plain', 'good', 'quality'] as GoodTier[]) ok(MEALS.filter(r => TIER[r] === t).length >= 2, `at least two meals are ${t}`);
for (const t of ['plain', 'quality'] as GoodTier[]) ok(DRINKS.filter(r => TIER[r] === t).length >= 2, `at least two drinks are ${t}`);

// 2. The stage rule: a recipe sits one stage above its deepest input (flour counts as stage 1), and a meal's stage is its
// tier. A recipe that takes a good of some tier makes a good of a higher one: one level up, never sideways.
const RAW = new Set(BUILDINGS.flatMap(d => (d.recipes ?? []).filter(r => !Object.keys(r.inputs).length).map(r => r.output)));
const stage: Partial<Record<ResourceId, number>> = Object.fromEntries([...RAW].map(r => [r, 0]));
const recipeStage = (inputs: Partial<Record<InputKey, number>>) => Math.max(...(Object.keys(inputs) as InputKey[]).map(k => Math.min(...membersOf(k).map(m => stage[m] ?? Infinity)))) + 1;
for (let pass = 0; pass < 12; pass++) for (const d of BUILDINGS) for (const rec of d.recipes ?? []) {
  if (!Object.keys(rec.inputs).length) continue;
  const v = recipeStage(rec.inputs); if (v < (stage[rec.output] ?? Infinity)) stage[rec.output] = v;
}
for (const r of MEALS) ok(stage[r] === TIER_STAGE[TIER[r]!], `${r} is stage ${stage[r]}, as its tier (${TIER[r]}) says`);
const rank = (r: ResourceId) => (TIER[r] ? TIER_RANK[TIER[r]!] : r === 'flour' ? 0 : -1);
const sideways = BUILDINGS.flatMap(d => (d.recipes ?? []).filter(rec => FOOD.includes(rec.output) && (Object.keys(rec.inputs) as InputKey[]).some(k => membersOf(k).some(m => rank(m) >= rank(rec.output)))).map(rec => `${d.id}:${rec.output}`));
ok(!sideways.length, `every recipe makes something finer than what it takes${sideways.length ? ': ' + sideways.join(', ') : ''}`);

// 3. Buildings have one role each: gather, convert raw goods, process one level up, or serve. None makes two steps of
// one chain (nothing it makes goes into another of its own recipes), none has more than three recipes, and morale
// buildings make nothing.
const heavy = BUILDINGS.filter(d => (d.recipes ?? []).length > 3).map(d => d.id);
ok(!heavy.length, `no building has more than three recipes${heavy.length ? ': ' + heavy.join(', ') : ''}`);
// (the food and drink buildings: the woodcutter's rough planks are the one materials fallback)
const FOODHOUSES = BUILDINGS.filter(d => (d.recipes ?? []).some(r => FOOD.includes(r.output) || r.output === 'flour'));
const twoStep = FOODHOUSES.filter(d => { const outs = new Set((d.recipes ?? []).map(r => r.output)); return (d.recipes ?? []).some(r => (Object.keys(r.inputs) as InputKey[]).some(k => membersOf(k).some(m => outs.has(m)))); }).map(d => d.id);
ok(!twoStep.length, `no building makes two steps of one chain${twoStep.length ? ': ' + twoStep.join(', ') : ''}`);
const mixed = FOODHOUSES.filter(d => { const rs = d.recipes ?? []; return rs.some(r => !Object.keys(r.inputs).length) && rs.some(r => Object.keys(r.inputs).length); }).map(d => d.id);
ok(!mixed.length, `gatherers only gather${mixed.length ? ': ' + mixed.join(', ') : ''}`);
ok(['tavern', 'bathhouse', 'stage', 'cottage'].every(id => !BUILDINGS.find(d => d.id === id)!.recipes), 'the tavern, bathhouse, stage and cottage make nothing');
ok(BUILDINGS.filter(d => (d.recipes ?? []).some(r => r.output === 'flour' && r.stars > 1)).every(d => d.draftable), 'only a drafted building grinds flour at full speed');
// the quality rules (claude/mumblewood-flat-ladder.md): one building per quality recipe; each quality kitchen leans
// mostly on a different good-tier workshop; every quality meal takes from two workshops
const QUALITY = FOOD.filter(r => TIER[r] === 'quality');
const makersOf = (r: ResourceId) => BUILDINGS.filter(d => (d.recipes ?? []).some(x => x.output === r && Object.keys(x.inputs).length));
for (const r of QUALITY) ok(makersOf(r).length === 1, `${r} is made in one building (${makersOf(r).map(d => d.id).join(', ')})`);
const goodMaker = (m: ResourceId) => makersOf(m).filter(d => (d.recipes ?? []).some(x => x.output === m && x.stars === 3)).map(d => d.id);
const qualityMealKitchens = [...new Set(MEALS.filter(r => TIER[r] === 'quality').map(r => makersOf(r)[0].id))];
const leansOn = (id: string) => {
  const n: Record<string, number> = {};
  for (const rec of BUILDINGS.find(d => d.id === id)!.recipes ?? []) for (const k of Object.keys(rec.inputs) as InputKey[]) for (const m of membersOf(k)) if (TIER[m] === 'good') for (const g of goodMaker(m)) n[g] = (n[g] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
};
const leans = qualityMealKitchens.map(leansOn);
ok(qualityMealKitchens.length >= 2 && new Set(leans).size === leans.length, `each quality kitchen leans on a different workshop (${qualityMealKitchens.map((k, i) => `${k}: ${leans[i]}`).join(', ')})`);
for (const r of QUALITY) {
  const rec = makersOf(r)[0].recipes!.find(x => x.output === r)!;
  const from = new Set((Object.keys(rec.inputs) as InputKey[]).flatMap(k => membersOf(k).flatMap(m => makersOf(m).filter(d => (d.recipes ?? []).some(x => x.output === m && x.stars === 3)).map(d => d.id))));
  ok(from.size >= 2, `${r} takes from two workshops (${[...from].join(', ')})`);
}

// 4. Every map. For each pair of sites, the fewest drafts and the labour to reach each stage, and no stage that any one
// drafted building gates. A route is a set of drafted buildings and the worker-hours a unit takes (walking left out).
const SITE_IDS = SITES.map(s => s.id);
/** buildings whose every recipe turns raw goods (or nothing) into plain goods or flour */
const CONVERTERS = new Set(BUILDINGS.filter(d => (d.recipes ?? []).length && (d.recipes ?? []).every(r => (Object.keys(r.inputs) as InputKey[]).every(k => membersOf(k).every(m => !TIER[m] && m !== 'flour')))).map(d => d.id));
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
for (const kind of ['meal', 'drink'] as const) for (const t of ['plain', 'good', 'quality'] as GoodTier[]) {
  const goods = (kind === 'meal' ? MEALS : DRINKS).filter(r => TIER[r] === t);
  if (goods.length) STAGES.push([`${t} ${kind}`, goods]);
}
const table: Record<string, { min: number[]; hours: number[] }> = {};
const gates: string[] = [];
for (let i = 0; i < SITE_IDS.length; i++) for (let j = i + 1; j < SITE_IDS.length; j++) {
  // maps always have a drink site (world.ts DRINK_SITES): a clay bank and oaks together never happen
  if (![SITE_IDS[i], SITE_IDS[j]].some(x => DRINK_SITES.includes(x))) continue;
  const w = createWorld(3); w.sites = [SITE_IDS[i], SITE_IDS[j]] as SiteId[];
  const routes = routesOn(w);
  for (const [label, goods] of STAGES) {
    const rs = prune(goods.flatMap(g => routes(g)));
    ok(rs.length > 0, `${label} can be made on a ${w.sites.join('+')} map`);
    const row = (table[label] ??= { min: [], hours: [] });
    row.min.push(Math.min(...rs.map(r => r.d.size))); row.hours.push(Math.min(...rs.map(r => r.h)));
    // a workshop every route needs would gate the stage on this map. A converter (the mill, the smokehouse: raw goods
    // into plain ones) may: those are the must-drafts of the flat ladder. Workshops that process up may not.
    const always = [...new Set(rs.flatMap(r => [...r.d]))].filter(d => rs.every(r => r.d.has(d)) && !CONVERTERS.has(d));
    if (always.length) gates.push(`${label} on ${w.sites.join('+')} needs ${always.join(', ')}`);
  }
}
ok(!gates.length, `no stage hangs on one processing workshop on any map${gates.length ? ': ' + gates.join('; ') : ''}`);
for (const [label, row] of Object.entries(table)) {
  ok(Math.min(...row.min) === Math.max(...row.min), `${label}: the same fewest drafts on every map (${[...new Set(row.min)].join(', ')})`);
  ok(Math.max(...row.hours) / Math.min(...row.hours) < 1.1, `${label}: labour within 10% across maps (${Math.min(...row.hours).toFixed(2)}–${Math.max(...row.hours).toFixed(2)} h)`);
}
console.log('fewest drafts per stage:', Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.min[0]])));
const meals = ['plain meal', 'good meal', 'quality meal'].map(k => table[k].min[0]);
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
{ const w = shop(5, 'mill', 0, { acorns: 30, grain: 0 }); ok(made(w, 'flour', 'mill') && used(w, 'acorns', 'mill'), 'the mill grinds acorns into flour'); }
{ const w = shop(5, 'smokehouse', 1, { mushrooms: 30 }); ok(made(w, 'driedMushrooms', 'smokehouse'), 'the smokehouse dries mushrooms'); }
{ const w = shop(5, 'bakery', 1, { flour: 20 }); ok(made(w, 'pie', 'bakery') && used(w, 'flour', 'bakery') && used(w, 'berries', 'bakery'), 'a fruit pie from flour and berries'); }
{ const w = shop(5, 'cookhouse', 0, { smokedFish: 20, driedMushrooms: 20, herbs: 0 }); ok(made(w, 'hotpot', 'cookhouse') && used(w, 'driedMushrooms', 'cookhouse'), 'hotpot from smoked fish and dried mushrooms, with no herbs'); }
{ const w = shop(5, 'supperhouse', 1, { porridge: 20, driedMushrooms: 20 }); ok(made(w, 'harvest', 'supperhouse'), 'a harvest supper from porridge and dried mushrooms'); }
{ const w = shop(5, 'pieoven', 1, { pie: 20, hotpot: 20 }); ok(made(w, 'banquet', 'pieoven'), 'a banquet pie from fruit pie and hotpot'); }
{ const w = shop(5, 'brewery', 0, { grain: 30 }); ok(made(w, 'ale', 'brewery') && used(w, 'grain', 'brewery'), 'ale straight from grain'); }
{ const w = shop(5, 'stillhouse', 0, { cider: 20, herbs: 20 }); ok(made(w, 'hippocras', 'stillhouse') && used(w, 'cider', 'stillhouse'), 'hippocras from cider and herbs at the still house'); }

// 7. Traders never carry quality goods.
ok(TRADERS.every(t => t.sells.every(tradeable)), 'no trader lists a quality good');
ok(tradeable('flour') && tradeable('acorns') && tradeable('ale') && tradeable('bread') && !tradeable('fishpie') && !tradeable('hippocras'), 'raw, plain and good goods can be bought; quality goods cannot');
ok(RESOURCES.every(r => BASE_RATE[r.id] > 0), 'every good has a rate');

console.log(`ladder: ${n} checks passed`);

