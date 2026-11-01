// The missing link: a charter whose cheapest route waits on one blueprint gets that blueprint offered in every draft,
// and the bot takes it. Daily bread with no mill or malthouse waits on one of them: only they grind flour.
// Also: a feast larder is stocked for its guests.
// Usage: npx tsx tools/draft-link-check.ts
import { createWorld, apply, runHours, World, alive, feastUnservedDrinks } from '../src/sim/world';
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
console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
