// The missing link: a charter whose cheapest route waits on one blueprint gets that blueprint offered in every draft,
// and the bot takes it. Daily bread with no mill or malthouse waits on one of them: only they grind flour.
// Also: a feast larder is stocked for its guests.
// Usage: npx tsx tools/draft-link-check.ts
import { createWorld, apply, runHours, World, alive, feastUnservedDrinks, findSpot, recipesOf, recipeOn, Building, feastCheck, FEAST_MEALS, FEAST_DRINKS } from '../src/sim/world';
import { draftLinks } from '../src/sim/charterplan';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const GRINDERS = ['mill', 'malthouse'];
/** a map with no soil (so no grain field), a town that has picked Daily bread and owns no mill */
function breadTown(): World {
  for (let s = 1; s < 400; s++) {
    const w = createWorld(s * 53);
    if (w.sites.includes('soil')) continue;
    while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
    w.owned = w.owned.filter(id => !GRINDERS.includes(id) && id !== 'field');
    w.charter = 'bread';
    return w;
  }
  throw new Error('no soilless map');
}

{
  const w = breadTown();
  const link = draftLinks(w).find(id => GRINDERS.includes(id));
  check(!!link, `Daily bread with no mill or malthouse waits on a draft for: ${draftLinks(w).join(', ')}`);
  let drafts = 0, offered = 0;
  for (let h = 0; h < 24 * 40 && drafts < 6; h++) {
    for (const d of w.decisions) if (d.kind === 'blueprint') { drafts++; if (d.options.some(o => GRINDERS.includes(o))) offered++; }
    // pass on every draft, so the mill stays missing
    while (w.decisions.length) apply(w, { type: 'resolve', option: 99 });
    w.charter = 'bread'; w.owned = w.owned.filter(id => !GRINDERS.includes(id));
    runHours(w, 1);
  }
  check(drafts >= 3 && offered === drafts, `a mill or malthouse is offered in ${offered} of ${drafts} drafts`);
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
  check(took, 'the bot drafts a mill or malthouse when Daily bread waits on one');
}
{
  // a larder of hippocras, and guests who can't stand it: they're the ones still unserved
  const w = breadTown();
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; }
  const haters = alive(w).slice(0, 2); for (const c of haters) c.tastes.dislikes = ['hippocras'];
  w.res.hippocras = 40; w.res.cordial = 0;
  const un = feastUnservedDrinks(w);
  check(un.length === 2 && haters.every(c => un.includes(c)), `with only hippocras on hand, the ${un.length} guests who dislike it are the ones left unserved`);
  w.res.cordial = 5;
  check(feastUnservedDrinks(w).length === 0, 'with some cordial on hand too, everyone has a drink they’d take');
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
  // the bot follows a finale's goods all the way down: banquet pie wants fish pie, which wants hotpot, which wants
  // smoked fish. Each of those is switched on in whichever workshop makes it, not only the last step.
  const { w, at } = feastTown(['dock', 'smokehouse', 'pieoven', 'bakery'], { cordial: 14 });
  w.res.fish = 40; w.res.herbs = 20; w.res.flour = 20; w.res.berries = 20;
  autoBuild(w);
  const on = (id: string, out: string) => { const b = at(id); return recipesOf(b).some((r, i) => r.output === out && recipeOn(b, i)); };
  check(on('pieoven', 'banquet') && on('pieoven', 'fishpie') && on('smokehouse', 'hotpot') && on('smokehouse', 'smokedFish') && on('bakery', 'bread'),
    `for banquet pies the pie oven makes fish pie, the smokehouse hotpot and smoked fish, the bakery bread`);
  check(!on('pieoven', 'pie') && !on('pieoven', 'platter'), 'and the pie oven isn\u2019t also baking fruit pies, or platters it has no mulled cup for');
}
{
  // the last guest is owed a whole drink: a larder 0.8 short of its count still gets a full serving they'll take
  const { w, pav } = feastTown([], { banquet: 14, cordial: 13.2 });
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; }
  alive(w)[0].tastes.dislikes = ['cordial'];
  w.res.cordial = 20; w.res.hippocras = 5;
  for (let h = 0; h < 24 && (pav.delivered.hippocras ?? 0) < 1; h++) runHours(w, 1);
  check((pav.delivered.hippocras ?? 0) >= 0.999, `the guest who dislikes cordial gets a whole hippocras (${(pav.delivered.hippocras ?? 0).toFixed(2)} delivered)`);
}
{
  // a stocked larder of nothing but cordial, and a newcomer who can't stand it: a hippocras is carried in for them
  const { w, pav } = feastTown([], { banquet: 14, cordial: 14 }, true);
  for (const c of alive(w)) { c.tastes = { loves: [], dislikes: [] }; c.sulking = false; }
  const late = alive(w)[0]; late.tastes.dislikes = ['cordial'];
  const before = feastCheck(w).hungry;
  w.res.hippocras = 3;
  for (let h = 0; h < 24 && (pav.delivered.hippocras ?? 0) < 1; h++) runHours(w, 1);
  check(before === 1 && (pav.delivered.hippocras ?? 0) >= 0.999 && (pav.delivered.hippocras ?? 0) < 1.5 && feastCheck(w).hungry === 0,
    `a stocked pavilion takes one hippocras for the guest who dislikes cordial (${before} unserved before, ${feastCheck(w).hungry} after, ${(pav.delivered.hippocras ?? 0).toFixed(2)} delivered)`);
}
{
  // nobody refuses a magnificent meal, and nobody dislikes more than one drink: a larder with both quality drinks suits anyone
  let n = 0, bad = 0;
  for (let s = 1; s <= 60; s++) for (const c of createWorld(s * 101).colonists) {
    n++;
    if (c.tastes.dislikes.some(r => FEAST_MEALS.includes(r)) || c.tastes.dislikes.filter(r => FEAST_DRINKS.includes(r)).length > 1) bad++;
  }
  check(bad === 0, `of ${n} settlers, ${bad} would refuse every magnificent meal or both quality drinks`);
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
