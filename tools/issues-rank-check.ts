// The Issues list as the player sees it: red (can cost people or the run) before yellow, soonest harm first, then
// by weight; "may leave" appears for anyone near walking out. Usage: npx tsx tools/issues-rank-check.ts
import { createWorld, alive } from '../src/sim/world';
import { rankForPlayer, Concern } from '../src/sim/advisor';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const c = (id: string, weight: number, people = 0): Concern => ({ id, title: id, evidence: '', idea: '', weight, people, personIds: Array.from({ length: people }, (_, i) => i), fixes: [] });

const w = createWorld(777);
const r = rankForPlayer(w, [c('vain', 40, 3), c('beds', 11, 1), c('sick', 4, 1), c('cold', 45, 6)]);
check(r[0].level === 'red' && r[1].level === 'red', `red first (${r.map(x => `${x.id}:${x.level}`)})`);
check(r[2].id === 'vain' && r[3].id === 'beds', 'yellow by weight');
const ties = rankForPlayer(w, [c('vain', 5, 1), c('beds', 5, 3)]);
check(ties[0].id === 'beds', 'equal weight: the one touching more people first');
const winter = rankForPlayer(w, [c('winter', 20)]);
check(winter[0].due != null, 'winter carries days until it arrives');
for (const p of alive(w)) p.mood = 90;
alive(w)[0].mood = 10;
const leaving = rankForPlayer(w, [c('vain', 40, 3)]);
check(leaving[0].id === 'leaving' && leaving[0].level === 'red' && leaving[0].personIds.length === 1, '"may leave" is red and names who');

console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
