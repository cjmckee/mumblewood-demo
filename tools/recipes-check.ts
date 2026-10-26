// Checks the multi-recipe engine on a building given two recipes: preference by stars, fallback, toggles.
// Usage: npx tsx tools/recipes-check.ts
import { createWorld, apply, runHours, findSpot, currentRecipe, blockedReason, reconcileStock, workersAt, alive, World } from '../src/sim/world';
import { BUILDING_BY_ID } from '../src/sim/content';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

// give the stew kitchen a second, better recipe for this test only
BUILDING_BY_ID.kitchen.recipes = [
  { inputs: { rawFood: 1.5 }, output: 'stew', stars: 2 },
  { inputs: { fish: 1.2 }, output: 'smokedFish', stars: 3 },
];
const w: World = createWorld(4242, 'normal');
while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
const spot = findSpot(w, 'kitchen')!;
check(apply(w, { type: 'place', def: 'kitchen', x: spot.x, y: spot.y }) === null, 'placed a kitchen');
const k = w.buildings.find(b => b.def === 'kitchen')!;
k.built = true; // skip construction for the test
const out = () => currentRecipe(w, k)?.output;

check(out() === 'stew', 'no fish in storage: falls back to the ★★ stew');
w.res.fish = 40; reconcileStock(w);
check(out() === 'smokedFish', 'fish in storage: prefers the ★★★ smoked fish');
apply(w, { type: 'toggleRecipe', building: k.uid, recipe: 1, on: false });
check(out() === 'stew', 'smoked fish switched off: back to stew');
apply(w, { type: 'toggleRecipe', building: k.uid, recipe: 0, on: false });
check(out() === undefined && blockedReason(w, k) === 'Every recipe here is switched off.', 'everything off: blocked, with a reason');
apply(w, { type: 'toggleRecipe', building: k.uid, recipe: 1, on: true });
check(out() === 'smokedFish' && blockedReason(w, k) === null, 'smoked fish back on: runs again');

// staff it and let it work: smoked fish should come out, and the fish should go in
for (const c of alive(w).slice(0, 2)) apply(w, { type: 'assign', colonist: c.id, building: k.uid });
check(workersAt(w, k.uid).length === 2, 'two cooks assigned');
const before = w.flows['smokedFish:+kitchen'] ?? 0;
runHours(w, 10);
const made = (w.flows['smokedFish:+kitchen'] ?? 0) - before;
check(made > 1, `kitchen made smoked fish (${made.toFixed(1)})`);
check((w.flows['fish:-kitchen'] ?? 0) > 1, 'and used fish to do it');

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
