// Blueprint reroll rules: 10 gold, then 20, then 30 across the run; three new options when the pool has them;
// refused when wood is short or nothing is being drafted. Usage: npx tsx tools/reroll-check.ts
import { createWorld, apply, runHours, World, rerollCost } from '../src/sim/world';
import { START } from '../src/sim/scenario';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const w: World = createWorld(2024);
while (w.decisions.length) apply(w, { type: 'resolve', option: 0 });
check(apply(w, { type: 'reroll' }) !== null, 'refused when no blueprint draft is open');

// run to the first blueprint draft (day 3 dawn), answering anything else on the way
const toDraft = () => { for (let h = 0; h < 24 * (START.draftEvery + 1); h++) { while (w.decisions.length && w.decisions[0].kind !== 'blueprint') apply(w, { type: 'resolve', option: 99 }); if (w.decisions[0]?.kind === 'blueprint') return true; runHours(w, 1); } return false; };
check(toDraft(), 'a blueprint draft comes up');
w.gold = 100;
const first = (w.decisions[0] as { options: string[] }).options.slice();
check(rerollCost(w) === 10, 'first reroll costs 10');
check(apply(w, { type: 'reroll' }) === null && w.gold === 90, 'pays 10 gold');
const second = (w.decisions[0] as { options: string[] }).options.slice();
check(second.length === 3 && !second.some(id => first.includes(id)), `three new options (${first.join(', ')} → ${second.join(', ')})`);
check(rerollCost(w) === 20 && apply(w, { type: 'reroll' }) === null && w.gold === 70, 'second reroll on the same draft costs 20');
check(rerollCost(w) === 30, 'and the next one 30');
apply(w, { type: 'resolve', option: 0 });
check(toDraft(), 'a later blueprint draft comes up');
w.gold = 25;
check(apply(w, { type: 'reroll' }) === 'A reroll costs 30 gold.' && w.gold === 25, 'a new draft keeps the run’s price (30), and short gold is refused without charge');
check((w.flows['gold:-reroll'] ?? 0) === 30, 'rerolls show in the gold ledger');

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
