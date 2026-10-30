// Storage priority: three levels (high, medium, low), medium by default; saves from before read high as high and
// the rest as medium. Usage: npx tsx tools/storage-priority-check.ts
import { createWorld, apply, storePrio, storages } from '../src/sim/world';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const w = createWorld(777);
const pile = storages(w)[0];
check(!!pile && storePrio(pile) === 1, 'a new stockpile is medium priority');
check(apply(w, { type: 'storagePriority', building: pile.uid, prio: 0 }) === null && storePrio(pile) === 0 && !pile.high, 'set to low');
check(apply(w, { type: 'storagePriority', building: pile.uid, prio: 2 }) === null && storePrio(pile) === 2 && pile.high, 'set to high (and the old flag follows)');
check(apply(w, { type: 'storagePriority', building: pile.uid, high: false }) === null && storePrio(pile) === 1, 'the old two-level command still works: not high is medium');
const old = JSON.parse(JSON.stringify(pile)); delete old.prio;
check(storePrio({ ...old, high: true }) === 2 && storePrio({ ...old, high: false }) === 1, 'older saves: high stays high, the rest read as medium');
const hut = w.buildings.find(b => b.def === 'forager')!;
check(apply(w, { type: 'storagePriority', building: hut.uid, prio: 2 }) !== null, 'only storage has a priority');

console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
