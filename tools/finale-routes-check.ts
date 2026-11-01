// Finale routes: the bot works each finale category (magnificent meals, quality drinks) along one chosen chain, and
// reserves the drinks on it so the tavern doesn't pour them. Also: the drink rules themselves.
// Usage: npx tsx tools/finale-routes-check.ts
import { createWorld, apply, World, findSpot, festivalPreview, drinkableTotal } from '../src/sim/world';
import { cheapestRoute, finaleOwed, finaleRoutes, ROUTE_AVOID, autoFoodRules } from '../src/sim/autoplayer';

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
  check(owed.feastMeal === 14 && owed.feastDrink === 14, `before the pavilion goes up, the Long Table owes 14 magnificent meals and 14 quality drinks (${JSON.stringify(owed)})`);
  w.res.banquet = 5;
  check(finaleOwed(w).feastMeal === 9, 'banquet pies in storage count against what it owes');
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
console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
