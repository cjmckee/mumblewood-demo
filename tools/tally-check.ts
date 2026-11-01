// Charters that count goods enjoyed or made since they were picked, renown, and the magnificent finale.
// npx tsx tools/tally-check.ts
import assert from 'node:assert/strict';
import { CHARTERS, BUILDINGS, MEALS, CATEGORIES, TIER, ResourceId, SiteId, InputKey, membersOf, CharterMetric } from '../src/sim/content';
import { createWorld, apply, alive, runHours, debugGrow, reconcileStock, flow, tallyOf, renownOf, charterProgress, findSpot, siteOk, FEAST_MEALS, FEAST_DRINKS, World, recipesOf, recipeOn } from '../src/sim/world';
import { autoBuild, autoFoodRules } from '../src/sim/autoplayer';

let n = 0; const ok = (cond: unknown, msg: string) => { assert(cond, msg); n++; };
const clear = (w: World) => { while (w.decisions.length) apply(w, { type: 'resolve', option: 99 }); };
const parts = (m: CharterMetric): CharterMetric[] => (m.kind === 'all' ? m.parts : [m]);

// 1. No charter asks for food or drink in storage any more.
ok(CHARTERS.every(c => parts(c.metric).every(p => p.kind !== 'stock' && p.kind !== 'variety')), 'no charter counts stored food, drink or materials');
ok(CHARTERS.filter(c => c.tier === 2).every(c => parts(c.metric).some(p => p.kind === 'tally' || p.kind === 'renown' || p.kind === 'built')), 'every tier-2 charter counts goods enjoyed or a building');

// 2. Picking a charter starts a fresh tally; flows count by how the good was enjoyed.
{
  const w = createWorld(31); w.nextEventHour = 1e9; debugGrow(w, 6);
  w.decisions = [{ kind: 'charter', tier: 1, options: ['settled', 'woodsmoke', 'firstplanks'] }];
  apply(w, { type: 'resolve', option: 0 });
  ok(w.charter === 'settled' && w.tally && !Object.keys(w.tally.eaten).length, 'picking a charter starts an empty tally');
  flow(w, 'pie:-eaten', 1); flow(w, 'stew:-festival', 2); flow(w, 'smokedFish:-spoiled', 5); flow(w, 'stew:-sold', 3);
  flow(w, 'mulled:-drunk', 1); flow(w, 'ale:-feast', 1); flow(w, 'ale:-bard', 6); flow(w, 'ale:-ciderpress', 2);
  flow(w, 'tonic:-clinic', 0.15); flow(w, 'planks:+sawmill', 4); flow(w, 'planks:+caravan', 9);
  ok(tallyOf(w, 'eaten', MEALS) === 3, 'eaten counts meals and festival plates, not spoiled or sold food');
  ok(tallyOf(w, 'drunk', CATEGORIES.drink.members) === 2, 'drunk counts the tavern and the feast, not the bard’s fee or mulling');
  ok(Math.abs(tallyOf(w, 'used', ['tonic']) - 0.15) < 1e-9, 'used counts what the doctor uses');
  ok(tallyOf(w, 'made', ['planks']) === 4, 'made counts workshops, not planks bought from the caravan');
}

// 3. In play: Settled in fills as meals are eaten, and completes.
{
  const w = createWorld(33); w.nextEventHour = 1e9; debugGrow(w, 6);
  w.decisions = [{ kind: 'charter', tier: 1, options: ['settled', 'woodsmoke', 'firstplanks'] }]; apply(w, { type: 'resolve', option: 0 });
  w.res.stew = 80; w.res.berries = 40; w.res.wood = 60; reconcileStock(w);
  for (const c of alive(w)) { c.hunger = 30; }
  let h = 0;
  while (w.charter === 'settled' && h < 24 * 10) { w.moodLog = Array(24).fill(70); for (const c of alive(w)) { c.mood = 70; c.moodTarget = 70; } runHours(w, 1); clear(w); h++; }
  ok(w.chartersDone.includes('settled'), `30 meals eaten completes Settled in (${h}h, ${Math.floor(tallyOf(w, 'eaten', MEALS))} eaten)`);
  ok(w.res.stew > 30, 'without hoarding: stew was eaten from a full larder');
}

// 4. Renown: by tier, and from enough kinds.
{
  const w = createWorld(35); w.charter = 'menu'; w.tally = { eaten: { stew: 50, bread: 10, pie: 10 }, drunk: {}, made: {}, used: {} };
  const r = renownOf(w, 'meal');
  ok(r.points === 10 * 1 + 10 * 2 && r.kinds.join() === 'pie,bread', `stew earns no renown; bread 1, pie 2 (${r.points}, ${r.kinds})`);
  w.tally.eaten.supper = 3;
  ok(renownOf(w, 'meal').points === 42 && renownOf(w, 'meal').kinds.length === 2, 'a magnificent meal earns 4, but 3 of a kind don’t count as a kind yet');
  const label = charterProgress(w)?.label ?? '';
  ok(/42 \/ 60 renown · 2 \/ 3 kinds/.test(label), `the card says where renown stands (${label})`);
}

// 5. The magnificent supper: a loaf and a refined side, made on every map, at the bakery and smokehouse.
const SITE_IDS: SiteId[] = ['grove', 'meadow', 'soil', 'clay'];
function makeable(w: World, r: ResourceId, depth = 5): boolean {
  return depth >= 0 && BUILDINGS.some(d => siteOk(w, d) && (d.recipes ?? []).some(rec => rec.output === r && (Object.keys(rec.inputs) as InputKey[]).every(k => membersOf(k).some(m => makeable(w, m, depth - 1)))));
}
ok(FEAST_MEALS.join() === 'supper' && FEAST_MEALS.every(r => TIER[r] === 'magnificent'), 'the feast serves magnificent meals');
ok(FEAST_DRINKS.length >= 3, `the feast has several drinks to choose from, so tastes can be met (${FEAST_DRINKS})`);
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
  const w = createWorld(3); w.sites = [SITE_IDS[i], SITE_IDS[j]];
  ok(makeable(w, 'supper') && makeable(w, 'mulled'), `suppers and mulled cups can be made on a ${w.sites.join('+')} map`);
}
{
  const w = createWorld(37); w.nextEventHour = 1e9; debugGrow(w, 6); w.owned.push('bakery');
  const spot = findSpot(w, 'bakery'); assert(spot); apply(w, { type: 'place', def: 'bakery', ...spot });
  const b = w.buildings.at(-1)!; b.built = true; b.off = (BUILDINGS.find(d => d.id === 'bakery')!.recipes ?? []).flatMap((r, i) => r.output === 'supper' ? [] : [i]);
  w.res.bread = 20; w.res.skewers = 20; w.res.berries = 40; reconcileStock(w);
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  apply(w, { type: 'assign', colonist: alive(w)[0].id, building: b.uid });
  for (let h = 0; h < 36; h++) { clear(w); runHours(w, 1); }
  ok((w.flows['supper:+bakery'] ?? 0) > 2 && (w.flows['bread:-bakery'] ?? 0) > 0 && (w.flows['skewers:-bakery'] ?? 0) > 0, 'the bakery plates suppers from bread and skewers');
}

// 6. Nobody dislikes a magnificent meal, so one kind can serve a whole feast.
{
  const w = createWorld(39); debugGrow(w, 40);
  ok(alive(w).every(c => !c.tastes.dislikes.includes('supper')), 'no settler dislikes the ploughman’s supper');
}

// 7. The bot, during the Long Table: a bakery aimed at suppers keeps baking the bread they need, and bread and
//    sides are kept for the pavilion's suppers while there's other food. The pavilion keeps the suppers themselves.
{
  const w = createWorld(41); w.nextEventHour = 1e9; debugGrow(w, 14); w.charter = 'longtable'; w.decisions = [];
  for (const id of ['bakery', 'smokehouse']) { if (!w.owned.includes(id)) w.owned.push(id); const spot = findSpot(w, id); assert(spot); apply(w, { type: 'place', def: id, ...spot }); w.buildings.at(-1)!.built = true; }
  w.owned.push('pavilion'); const ps = findSpot(w, 'pavilion'); assert(ps); apply(w, { type: 'place', def: 'pavilion', ...ps }); const pav = w.buildings.at(-1)!; pav.stage = 1; pav.delivered = {};
  w.res.berries = 200; w.res.flour = 30; w.res.fish = 30; w.res.bread = 0; w.res.supper = 2; w.res.stew = 40; reconcileStock(w);
  autoBuild(w);
  const bakery = w.buildings.find(b => b.def === 'bakery')!, recs = recipesOf(bakery);
  const on = (out: string) => recs.some((r, i) => r.output === out && recipeOn(bakery, i));
  ok(on('supper') && on('bread'), `the bakery makes suppers and still bakes their bread (${recs.filter((r, i) => recipeOn(bakery, i)).map(r => r.output)})`);
  autoFoodRules(w);
  ok(['bread', 'smokedFish', 'skewers'].every(r => w.forbidden.includes(r as never)) && !w.forbidden.includes('supper'), `bread and sides are kept for the pavilion's suppers; suppers themselves aren't held back (${w.forbidden})`);
  ok(!w.forbidden.includes('stew'), 'everything else is still eaten');
}
// 8. Hale and hearty can be finished without anyone falling ill.
{
  const hearty = CHARTERS.find(c => c.id === 'hearty')!;
  ok(parts(hearty.metric).every(p => !(p.kind === 'tally' && p.how === 'used')), 'Hale and hearty counts tonics made, since its other condition is a day with nobody sick');
}

console.log(`tally: ${n} checks passed`);
