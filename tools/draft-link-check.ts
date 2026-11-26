// The missing link: a charter whose cheapest route waits on one blueprint gets that blueprint offered in every draft,
// and the bot takes it. Daily bread with no bakery waits on one: the kitchen can grind a little flour, but only the bakery bakes.
// Also: a feast larder is stocked for its guests.
// Usage: npx tsx tools/draft-link-check.ts
import { createWorld, apply, runHours, World, alive, feastUnservedDrinks, findSpot, recipesOf, recipeOn, Building, feastCheck, FEAST_MEALS, FEAST_DRINKS } from '../src/sim/world';
import { draftLinks } from '../src/sim/charterplan';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { FINALE_COLONISTS } from '../src/sim/content';
import { START as START_DRAFTS } from '../src/sim/scenario';
// these fixtures test production and routes, not when drafts come: keep the old day timer so their RNG stays put
START_DRAFTS.drafts.mode = 'days';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const GRINDERS = ['bakery'];
/** a map with no soil (so no grain field), a town that has picked Daily bread and owns a mill but no bakery */
function breadTown(): World {
  for (let s = 1; s < 400; s++) {
    const w = createWorld(s * 53);
    if (w.sites.includes('soil')) continue;
    while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
    w.owned = w.owned.filter(id => !GRINDERS.includes(id) && id !== 'field'); if (!w.owned.includes('mill')) w.owned.push('mill');
    w.charter = 'bread';
    return w;
  }
  throw new Error('no soilless map');
}

{
  const w = breadTown();
  const link = draftLinks(w).find(id => GRINDERS.includes(id));
  check(!!link, `Daily bread with no bakery waits on a draft for: ${draftLinks(w).join(', ')}`);
  let drafts = 0, offered = 0;
  for (let h = 0; h < 24 * 40 && drafts < 6; h++) {
    for (const d of w.decisions) if (d.kind === 'blueprint') { drafts++; if (d.options.some(o => GRINDERS.includes(o))) offered++; }
    // pass on every draft, so the bakery stays missing
    while (w.decisions.length) apply(w, { type: 'resolve', option: 99 });
    w.charter = 'bread'; w.owned = w.owned.filter(id => !GRINDERS.includes(id));
    runHours(w, 1);
  }
  check(drafts >= 3 && offered === drafts, `a bakery is offered in ${offered} of ${drafts} drafts`);
}
{
  const w = breadTown();
  let took = false;
  for (let h = 0; h < 24 * 40 && !took; h++) {
    for (const d of w.decisions) if (d.kind === 'blueprint' && d.options.some(o => GRINDERS.includes(o))) { autoDecide(w, 'greedy', Math.random); took = GRINDERS.some(id => w.owned.includes(id)); }
    while (w.decisions.length) apply(w, { type: 'resolve', option: 99 });
    w.charter = 'bread';
    runHours(w, 1);
  }
  check(took, 'the bot drafts a bakery when Daily bread waits on one');
}
{
  // a larder of hippocras, and guests who can't stand it: at the founders' feast they drink it anyway
  const w = breadTown();
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; }
  const haters = alive(w).slice(0, 2); for (const c of haters) c.tastes.dislikes = ['hippocras'];
  w.res.hippocras = 40; w.res.cordial = 0;
  check(feastUnservedDrinks(w).length === 0, 'with only hippocras on hand, the guests who dislike it still have a drink');
  w.res.hippocras = alive(w).length - 1;
  check(feastUnservedDrinks(w).length === 1, 'one short of a drink each: one guest is unserved');
}
/** a town on the Long Table with the given workshops built and the pavilion stocking its larder */
function feastTown(defs: string[], larder: Record<string, number>, ready = false): { w: World; at: (id: string) => Building; pav: Building } {
  const w = createWorld(81);
  while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
  w.charter = 'longtable';
  for (const id of [...defs, 'pavilion']) {
    if (!w.owned.includes(id)) w.owned.push(id);
    const s = findSpot(w, id, 16, 16, true)!; apply(w, { type: 'place', def: id, x: s.x, y: s.y });
    const b = w.buildings.at(-1)!; b.built = id !== 'pavilion' || ready; if (id === 'pavilion') { b.stage = 1; b.delivered = { ...larder } as typeof b.delivered; }
  }
  const at = (id: string) => w.buildings.find(b => b.def === id)!;
  return { w, at, pav: at('pavilion') };
}
{
  // the bot follows a finale's goods all the way down: a pie oven's quality meal wants a good-tier dish from the bakery,
  // which wants flour, and smoked fish or hotpot. Each is switched on in whichever workshop makes it, not only the last step.
  const { w, at } = feastTown(['dock', 'smokehouse', 'cookhouse', 'pieoven', 'bakery'], { cordial: 14 });
  w.res.fish = 40; w.res.herbs = 20; w.res.flour = 20; w.res.berries = 20;
  autoBuild(w);
  const on = (id: string, out: string) => { const b = at(id); return recipesOf(b).some((r, i) => r.output === out && recipeOn(b, i)); };
  const onAt = (id: string) => recipesOf(at(id)).filter((r, i) => recipeOn(at(id), i)).map(r => r.output).join('+');
  check((on('pieoven', 'honeycake') || on('pieoven', 'fishpie')) && on('smokehouse', 'smokedFish') && (on('bakery', 'pie') || on('bakery', 'bread')),
    `for quality meals the pie oven, the smokehouse and the bakery all work the route (pie oven ${onAt('pieoven')}, smokehouse ${onAt('smokehouse')}, bakery ${onAt('bakery')}, cookhouse ${onAt('cookhouse')})`);
}
{
  // a larder one drink short gets a whole one more
  const { w, pav } = feastTown([], { honeycake: FINALE_COLONISTS, cordial: FINALE_COLONISTS - 1 });
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; }
  w.res.cordial = 20;
  for (let h = 0; h < 24 && (pav.delivered.cordial ?? 0) < FINALE_COLONISTS; h++) runHours(w, 1);
  check((pav.delivered.cordial ?? 0) === FINALE_COLONISTS, `a larder one drink short gets one whole cordial (${pav.delivered.cordial} in it)`);
}
{
  // a stocked larder of nothing but cordial, and a guest who can't stand it: the feast is ready all the same
  const { w, pav } = feastTown([], { honeycake: 14, cordial: 14 }, true);
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; }
  alive(w)[0].tastes.dislikes = ['cordial'];
  w.res.hippocras = 3;
  runHours(w, 12);
  check(feastCheck(w).hungry === 0 && !(pav.delivered.hippocras ?? 0), `a guest who dislikes cordial still sits down to one, and no hippocras is carried in (${feastCheck(w).hungry} unserved)`);
}
{
  // nobody refuses a quality meal, and nobody dislikes more than one drink: a larder with both quality drinks suits anyone
  let n = 0, bad = 0;
  for (let s = 1; s <= 60; s++) for (const c of createWorld(s * 101).colonists) {
    n++;
    if (c.tastes.dislikes.some(r => FEAST_MEALS.includes(r)) || c.tastes.dislikes.filter(r => FEAST_DRINKS.includes(r)).length > 1) bad++;
  }
  check(bad === 0, `of ${n} settlers, ${bad} would refuse every quality meal or both quality drinks`);
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
