// Charters that count goods enjoyed or made since they were picked, renown, and the quality finale.
// npx tsx tools/tally-check.ts
import assert from 'node:assert/strict';
import { CHARTERS, BUILDINGS, MEALS, CATEGORIES, TIER, ResourceId, SiteId, InputKey, membersOf, CharterMetric } from '../src/sim/content';
import { createWorld, DRINK_SITES, apply, alive, runHours, debugGrow, reconcileStock, flow, tallyOf, renownOf, charterProgress, findSpot, siteOk, FEAST_MEALS, FEAST_DRINKS, World, recipesOf, recipeOn } from '../src/sim/world';
import { autoBuild, autoFoodRules, ROUTE_AVOID } from '../src/sim/autoplayer';

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
  flow(w, 'pie:-eaten', 1); flow(w, 'stew:-wedding', 2); flow(w, 'smokedFish:-spoiled', 5); flow(w, 'stew:-sold', 3);
  flow(w, 'hippocras:-drunk', 1); flow(w, 'ale:-feast', 1); flow(w, 'ale:-bard', 6); flow(w, 'ale:-stillhouse', 2);
  flow(w, 'tonic:-clinic', 0.15); flow(w, 'planks:+sawmill', 4); flow(w, 'planks:+caravan', 9);
  ok(tallyOf(w, 'eaten', MEALS) === 3, 'eaten counts meals and wedding plates, not spoiled or sold food');
  ok(tallyOf(w, 'drunk', CATEGORIES.drink.members) === 2, 'drunk counts the tavern and the feast, not the bard’s fee or the still');
  ok(Math.abs(tallyOf(w, 'used', ['tonic']) - 0.15) < 1e-9, 'used counts what the doctor uses');
  ok(tallyOf(w, 'made', ['planks']) === 4, 'made counts workshops, not planks bought from the caravan');
}

// 3. In play: Settled in fills as meals are eaten, and completes.
{
  const w = createWorld(33); w.nextEventHour = 1e9; debugGrow(w, 6);
  w.decisions = [{ kind: 'charter', tier: 1, options: ['settled', 'woodsmoke', 'firstplanks'] }]; apply(w, { type: 'resolve', option: 0 }); w.charterOffered = true;
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
  ok(r.points === 10 * 2 + 10 * 2 && r.kinds.join() === 'pie,bread', `stew earns no renown; bread and pie 2 each (${r.points}, ${r.kinds})`);
  w.tally.eaten.honeycake = 3;
  ok(renownOf(w, 'meal').points === 52 && renownOf(w, 'meal').kinds.length === 2, 'a quality meal earns 4, but 3 of a kind don’t count as a kind yet');
  const label = charterProgress(w)?.label ?? '';
  ok(/52 \/ 40 renown · 2 \/ 3 kinds/.test(label), `the card says where renown stands (${label})`);
}

// 5. The finales' goods: quality meals and quality drinks, made on every map; the supper house plates a ploughman's supper.
const SITE_IDS: SiteId[] = ['grove', 'meadow', 'soil', 'clay', 'oaks'];
function makeable(w: World, r: ResourceId, depth = 5): boolean {
  return depth >= 0 && BUILDINGS.some(d => siteOk(w, d) && (d.recipes ?? []).some(rec => rec.output === r && (Object.keys(rec.inputs) as InputKey[]).every(k => membersOf(k).some(m => makeable(w, m, depth - 1)))));
}
ok(FEAST_MEALS.length >= 2 && FEAST_MEALS.every(r => TIER[r] === 'quality'), `the feast serves quality meals (${FEAST_MEALS})`);
ok(FEAST_DRINKS.length >= 2 && FEAST_DRINKS.every(r => TIER[r] === 'quality'), `the feast has quality drinks to choose from, so tastes can be met (${FEAST_DRINKS})`);
for (let i = 0; i < SITE_IDS.length; i++) for (let j = i + 1; j < SITE_IDS.length; j++) {
  if (![SITE_IDS[i], SITE_IDS[j]].some(x => DRINK_SITES.includes(x))) continue; // every map has a drink site
  const w = createWorld(3); w.sites = [SITE_IDS[i], SITE_IDS[j]];
  ok(FEAST_MEALS.every(r => makeable(w, r, 7)) && FEAST_DRINKS.every(r => makeable(w, r, 7)), `every quality meal and quality drink can be made on a ${w.sites.join('+')} map`);
}
{
  const w = createWorld(37); w.nextEventHour = 1e9; debugGrow(w, 6); w.owned.push('supperhouse');
  const spot = findSpot(w, 'supperhouse'); assert(spot); apply(w, { type: 'place', def: 'supperhouse', ...spot });
  const b = w.buildings.at(-1)!; b.built = true; b.off = (BUILDINGS.find(d => d.id === 'supperhouse')!.recipes ?? []).flatMap((r, i) => r.output === 'supper' ? [] : [i]);
  w.res.bread = 20; w.res.hotpot = 20; w.res.berries = 40; reconcileStock(w);
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  apply(w, { type: 'assign', colonist: alive(w)[0].id, building: b.uid });
  for (let h = 0; h < 36; h++) { clear(w); runHours(w, 1); }
  ok((w.flows['supper:+supperhouse'] ?? 0) > 2 && (w.flows['bread:-supperhouse'] ?? 0) > 0 && (w.flows['hotpot:-supperhouse'] ?? 0) > 0, 'the supper house plates suppers from bread and hotpot');
}

// 6. Nobody dislikes a quality meal, so one kind can serve a whole feast.
{
  const w = createWorld(39); debugGrow(w, 40);
  ok(alive(w).every(c => FEAST_MEALS.every(r => !c.tastes.dislikes.includes(r))), 'no settler dislikes a quality meal');
}

// 7. The bot, during the Long Table: a pie oven aimed at honey cakes, the bakery keeps making the fruit pies they
//    need, and what the quality meals are made from is kept for the pavilion while there's other food.
{
  const w = createWorld(41); w.nextEventHour = 1e9; debugGrow(w, 14); w.charter = 'longtable'; w.decisions = [];
  for (const id of ['pieoven', 'bakery', 'cookhouse']) { if (!w.owned.includes(id)) w.owned.push(id); const spot = findSpot(w, id); assert(spot); apply(w, { type: 'place', def: id, ...spot }); w.buildings.at(-1)!.built = true; }
  w.owned.push('pavilion'); const ps = findSpot(w, 'pavilion'); assert(ps); apply(w, { type: 'place', def: 'pavilion', ...ps }); const pav = w.buildings.at(-1)!; pav.stage = 1; pav.delivered = {};
  w.res.berries = 200; w.res.hotpot = 10; w.res.pie = 10; w.res.flour = 10; w.res.fish = 30; w.res.fishpie = 0; w.res.honeycake = 2; w.res.stew = 40; w.res.bread = 6; reconcileStock(w);
  ROUTE_AVOID.push('pieoven:fishpie');
  autoBuild(w);
  const oven = w.buildings.find(b => b.def === 'pieoven')!, recs = recipesOf(oven);
  const on = (b: typeof oven, out: string) => recipesOf(b).some((r, i) => r.output === out && recipeOn(b, i));
  ok(on(oven, 'honeycake'), `the pie oven makes honey cakes (${recs.filter((r, i) => recipeOn(oven, i)).map(r => r.output)})`);
  const bakery = w.buildings.find(b => b.def === 'bakery')!;
  ok(on(bakery, 'pie'), `the bakery still bakes their fruit pies (${recipesOf(bakery).filter((r, i) => recipeOn(bakery, i)).map(r => r.output)})`);
  autoFoodRules(w);
  ROUTE_AVOID.length = 0;
  // the reserve is the route's: honey cakes from fruit pies. Stew, bread, hotpot and smoked fish aren't on it.
  ok(['pie', 'honeycake'].every(r => w.forbidden.includes(r as never)), `what the route's honey cakes are made from is kept for the pavilion (${w.forbidden})`);
  ok(!['stew', 'bread', 'hotpot', 'smokedFish'].some(r => w.forbidden.includes(r as never)), `everything off the route is still eaten (${w.forbidden})`);
}
// 8. Hale and hearty can be finished without anyone falling ill.
{
  const hearty = CHARTERS.find(c => c.id === 'hearty')!;
  ok(parts(hearty.metric).every(p => !(p.kind === 'tally' && p.how === 'used')), 'Hale and hearty counts tonics made, since its other condition is a day with nobody sick');
}

console.log(`tally: ${n} checks passed`);
