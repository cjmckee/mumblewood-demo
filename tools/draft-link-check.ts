// The missing link: a charter whose cheapest route waits on one blueprint (Daily bread with no mill: bread needs flour
// or acorn meal, and both are milled) gets that blueprint offered in every draft, and the bot takes it.
// Also: a forager hut starts gathering acorns as soon as a mill stands, and a feast larder is stocked for its guests.
// Usage: npx tsx tools/draft-link-check.ts
import { createWorld, apply, runHours, World, findSpot, built, alive, feastUnservedDrinks } from '../src/sim/world';
import { draftLinks } from '../src/sim/charterplan';
import { autoDecide, acornGatherer } from '../src/sim/autoplayer';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

/** a map with no soil (so no grain field), a town that has picked Daily bread and owns no mill */
function breadTown(): World {
  for (let s = 1; s < 400; s++) {
    const w = createWorld(s * 53);
    if (w.sites.includes('soil')) continue;
    while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
    w.owned = w.owned.filter(id => id !== 'mill' && id !== 'field');
    w.charter = 'bread';
    return w;
  }
  throw new Error('no soilless map');
}

{
  const w = breadTown();
  check(draftLinks(w).includes('mill'), `Daily bread with no mill waits on a draft for: ${draftLinks(w).join(', ')}`);
  let drafts = 0, offered = 0;
  for (let h = 0; h < 24 * 40 && drafts < 6; h++) {
    for (const d of w.decisions) if (d.kind === 'blueprint') { drafts++; if (d.options.includes('mill')) offered++; }
    // pass on every draft, so the mill stays missing
    while (w.decisions.length) apply(w, { type: 'resolve', option: 99 });
    w.charter = 'bread'; w.owned = w.owned.filter(id => id !== 'mill');
    runHours(w, 1);
  }
  check(drafts >= 3 && offered === drafts, `the mill is offered in ${offered} of ${drafts} drafts`);
}
{
  const w = breadTown();
  let took = false;
  for (let h = 0; h < 24 * 40 && !took; h++) {
    for (const d of w.decisions) if (d.kind === 'blueprint' && d.options.includes('mill')) { autoDecide(w, 'greedy', Math.random); took = w.owned.includes('mill'); }
    while (w.decisions.length) apply(w, { type: 'resolve', option: 99 });
    w.charter = 'bread';
    runHours(w, 1);
  }
  check(took, 'the bot drafts the mill when Daily bread waits on it');
}
{
  // acorns: a built mill and a bakery to bake with, no grain: the last forager hut gathers acorns straight away
  const w = breadTown();
  for (const id of ['mill', 'bakery', 'forager']) {
    if (!w.owned.includes(id)) w.owned.push(id);
    const spot = findSpot(w, id); if (!spot) throw new Error('no spot for ' + id);
    apply(w, { type: 'place', def: id, x: spot.x, y: spot.y }); w.buildings[w.buildings.length - 1].built = true;
  }
  w.res.berries += 200;
  const hut = acornGatherer(w);
  check(hut != null && built(w).find(b => b.uid === hut)?.def === 'forager', 'with an idle mill and no grain, a forager hut is set to gather acorns');
}
{
  // a larder of mulled cups, and guests who can't stand mulled: they're the ones still unserved
  const w = breadTown();
  const haters = alive(w).slice(0, 2); for (const c of haters) c.tastes.dislikes = ['mulled'];
  for (const c of alive(w).slice(2)) c.tastes.dislikes = [];
  w.res.mulled = 40; w.res.ale = 0;
  const un = feastUnservedDrinks(w);
  check(un.length === 2 && haters.every(c => un.includes(c)), `with only mulled on hand, the ${un.length} guests who dislike it are the ones left unserved`);
  w.res.ale = 5;
  check(feastUnservedDrinks(w).length === 0, 'with some ale on hand too, everyone has a drink they’d take');
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
