// Finale routes: the bot works each finale category (magnificent meals, quality drinks) along one chosen chain, and
// reserves the drinks on it so the tavern doesn't pour them. Also: the drink rules themselves.
// Usage: npx tsx tools/finale-routes-check.ts
import { createWorld, apply, World, findSpot, festivalPreview, drinkableTotal } from '../src/sim/world';
import { cheapestRoute, finaleOwed, finaleRoutes, finaleGoods, ROUTE_AVOID, autoFoodRules } from '../src/sim/autoplayer';
import { alive, costOf, debugGrow, finaleHeadcount, recruitInterval, feastCheck } from '../src/sim/world';
import { START } from '../src/sim/scenario';
import { seasonOf } from '../src/sim/seasons';
import { FINALE_COLONISTS } from '../src/sim/content';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

/** a town on the Long Table owning (and with built) the given workshops */
function town(defs: string[], charter = 'longtable'): World {
  const w = createWorld(81);
  while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
  w.charter = charter;
  for (const id of defs) {
    if (!w.owned.includes(id)) w.owned.push(id);
    const s = findSpot(w, id, 16, 16, true)!; apply(w, { type: 'place', def: id, x: s.x, y: s.y });
    w.buildings.at(-1)!.built = true;
  }
  return w;
}
const path = (r?: { steps: { def: string; output: string }[] }) => r ? r.steps.map(x => `${x.def}:${x.output}`).join(' > ') : 'none';

{
  const w = town([]);
  const owed = finaleOwed(w);
  const N = FINALE_COLONISTS;
  check(owed.feastMeal === N && owed.feastDrink === N, `before the pavilion goes up, the Long Table owes ${N} magnificent meals and ${N} quality drinks (${JSON.stringify(owed)})`);
  w.res.banquet = 5;
  check(finaleOwed(w).feastMeal === N - 5, 'banquet pies in storage count against what it owes');
}
{
  const w = town(['dock', 'smokehouse', 'pieoven', 'bakery', 'mill']);
  w.res.flour = 30;
  const r = cheapestRoute(w, ['banquet', 'platter'], 14);
  check(!!r && r.good === 'banquet' && r.steps.at(-1)!.output === 'banquet' && r.steps.some(x => x.output === 'fishpie') && r.steps.some(x => x.output === 'hotpot'),
    `banquet pies go fish pie ← hotpot ← smoked fish (${path(r)})`);
  ROUTE_AVOID.push('pieoven:banquet');
  const b = cheapestRoute(w, ['banquet'], 14);
  ROUTE_AVOID.length = 0;
  check(!!b && b.steps.at(-1)!.def === 'bakery', `with the pie oven's banquet pie forbidden, the bakery makes them (${path(b)})`);
  ROUTE_AVOID.push('pieoven');
  const none = cheapestRoute(w, ['banquet', 'platter'], 14);
  ROUTE_AVOID.length = 0;
  check(!none, `without the pie oven there's no fish pie, so no banquet pie here (${path(none)})`);
}
{
  // the route sticks: a little stock moving about doesn't flip it to the other category member
  const w = town(['dock', 'smokehouse', 'pieoven', 'bakery', 'mill', 'brewery', 'stillhouse', 'apothecary', 'ciderpress']);
  w.res.flour = 30; w.res.herbs = 30;
  const first = finaleRoutes(w).map(r => r.good).join(',');
  w.hour += 1; w.res.ale = 3;
  const again = finaleRoutes(w).map(r => r.good).join(',');
  check(first === again && first.split(',').length === 2, `one route for each category, kept from hour to hour (${first} → ${again})`);
}
{
  // drink rules: a reserved drink isn't poured at the festival or the tavern
  const w = town([]);
  for (const k of Object.keys(w.res)) (w.res as Record<string, number>)[k] = 0;
  w.res.stew = 30; w.res.hippocras = 30;
  const poured = festivalPreview(w).drinks;
  apply(w, { type: 'foodRule', food: 'hippocras', allowed: false });
  check(poured > 0 && festivalPreview(w).drinks === 0 && drinkableTotal(w) === 0, `reserved hippocras isn't poured (${poured} at the festival before, ${festivalPreview(w).drinks} after)`);
  apply(w, { type: 'foodRule', food: 'stew', allowed: false });
  check(festivalPreview(w).meals === 0, 'nor is reserved stew served at the festival');
}
{
  // the bot reserves its routes' drinks while the finale owes them, and lets them go after
  const w = town(['brewery', 'stillhouse', 'mill']);
  w.res.grain = 40; w.res.herbs = 30; w.res.ale = 5; w.res.mulled = 3;
  w.owned = w.owned.filter(id => id !== 'apothecary' && id !== 'ciderpress');
  autoFoodRules(w);
  const r = finaleRoutes(w).find(x => x.key === 'feastDrink');
  check(r?.good === 'hippocras' && ['hippocras', 'mulled', 'ale'].every(d => w.forbidden.includes(d as never)), `on the hippocras route, hippocras, mulled cups and ale are kept from the tavern (reserved: ${w.forbidden.join(', ')})`);
  w.charter = 'bread';
  autoFoodRules(w);
  check(!['hippocras', 'mulled', 'ale'].some(d => w.forbidden.includes(d as never)), 'with no finale owed, they’re poured again');
}
{
  // a stocked larder of cordial and a guest who can't stand it: the finale still owes them a drink, and only hippocras will do
  const w = town([]);
  w.owned.push('pavilion'); const s = findSpot(w, 'pavilion', 16, 16, true)!; apply(w, { type: 'place', def: 'pavilion', x: s.x, y: s.y });
  const pav = w.buildings.at(-1)!; pav.built = true; pav.stage = 1; pav.delivered = { banquet: 14, cordial: 14 } as typeof pav.delivered;
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; }
  alive(w)[0].tastes.dislikes = ['cordial'];
  w.res.cordial = 0; w.res.hippocras = 0;
  check(finaleOwed(w).feastDrink === 1 && finaleGoods(w, 'feastDrink').join() === 'hippocras', `a stocked larder with a guest it can't suit owes one drink, of a kind they'd take (${JSON.stringify(finaleOwed(w))}, ${finaleGoods(w, 'feastDrink')})`);
  w.res.hippocras = 2;
  check(!finaleOwed(w).feastDrink, 'with hippocras in storage to carry in, it owes nothing more');
}
{
  // the finale bill follows the colony: a magnificent meal and a quality drink for every colonist, 12 at least
  const w = town([]);
  w.owned.push('pavilion'); const s = findSpot(w, 'pavilion', 16, 16, true)!; apply(w, { type: 'place', def: 'pavilion', x: s.x, y: s.y });
  const pav = w.buildings.at(-1)!; pav.stage = 1;
  pav.headcount = finaleHeadcount(w);
  const few = costOf(pav);
  debugGrow(w, 15); pav.headcount = finaleHeadcount(w);
  const many = costOf(pav);
  check(few.feastMeal === FINALE_COLONISTS && few.feastDrink === FINALE_COLONISTS && many.feastMeal === 15 && many.feastDrink === 15,
    `the larder holds one each for every colonist, ${FINALE_COLONISTS} at least (${alive(createWorld(81)).length} colonists: ${few.feastMeal}; 15 colonists: ${many.feastMeal})`);
  pav.built = true; pav.delivered = { banquet: 15, cordial: 8, hippocras: 7 } as typeof pav.delivered;
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; c.illness = null; }
  const ready = feastCheck(w).ok;
  alive(w)[0].sulking = true;
  check(ready && !feastCheck(w).ok, 'the feast seats everyone: with 15 colonists, one sulker staying away sinks it');
}
{
  // population intent: offers at the season's pace below the stage's colony, none at it until the next charter tier
  const w = createWorld(5);
  const pace = START.seasons.recruitEvery[seasonOf(w).season];
  const below = recruitInterval(w);
  debugGrow(w, START.popTargets[0]);
  const at = recruitInterval(w);
  w.charterTier = 2;
  const next = recruitInterval(w);
  check(below === pace && at === 0 && next === pace, `recruit offers every ${below} days below ${START.popTargets[0]} colonists, ${at ? `every ${at}` : 'none'} at it, every ${next} once tier 2 asks for ${START.popTargets[1]}`);
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
