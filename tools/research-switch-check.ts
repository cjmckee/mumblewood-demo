// Studying now: the scholar switches straight away and hours already put into any project are kept; locked
// projects can't be picked; picking from the tree answers a waiting offer. Usage: npx tsx tools/research-switch-check.ts
import { createWorld, apply, researchOpen } from '../src/sim/world';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const w = createWorld(777);
w.research.done = ['cookery', 'messhall', 'physick'];
w.research.current = 'warehousing'; w.research.progress = 6;
check(apply(w, { type: 'study', id: 'joinery' }) === null && w.research.current === 'joinery' && w.research.progress === 0, 'switches now; a fresh project starts at 0');
check(w.research.partial?.warehousing === 6, 'the hours on the project left behind are kept');
w.research.progress = 20;
check(apply(w, { type: 'study', id: 'warehousing' }) === null && w.research.progress === 6 && w.research.partial?.joinery === 20 && w.research.partial?.warehousing === undefined, 'going back picks up where it was');
check(apply(w, { type: 'study', id: 'roads' }) !== null && w.research.current === 'warehousing', 'a locked project (roads before joinery) is refused');
check(apply(w, { type: 'study', id: 'warehousing' }) === null && w.research.progress === 6, 'picking the current project changes nothing');
w.decisions.push({ kind: 'research', options: researchOpen(w).map(r => r.id) });
apply(w, { type: 'study', id: 'gardening' });
check(!w.decisions.some(d => d.kind === 'research'), 'picking from the tree answers a waiting "what next?" offer');

console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
