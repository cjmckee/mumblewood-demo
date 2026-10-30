// The night skip: once every settler is in bed and nothing needs watching, everyoneAsleep() says so and main.ts runs
// the clock 4× faster until someone wakes. Usage: npx tsx tools/night-skip-check.ts
import { createWorld, runHours, everyoneAsleep, hourOfDay, alive } from '../src/sim/world';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const w = createWorld(777);
const until = (hour: number) => { while (hourOfDay(w) !== hour) runHours(w, 1); };
const clear = () => { w.decisions = []; w.errands = []; w.caravan = null; };

check(!everyoneAsleep(w), 'not on the first morning');
until(14); clear();
check(!everyoneAsleep(w), 'not in the afternoon');
until(2); clear();
const asleep = everyoneAsleep(w);
check(asleep, `everyone is asleep at 02:00 (${alive(w).map(c => c.activity).join(', ')})`);

if (asleep) {
  const c = alive(w)[0];
  c.activity = 'sick';
  check(everyoneAsleep(w), 'a bedridden settler counts as in bed');
  c.activity = 'hauling';
  check(!everyoneAsleep(w), 'one settler still up keeps the normal speed');
  c.activity = 'sleeping';

  w.errands = [{ id: 99, def: 'test', title: 'A test', text: '', hours: 2, done: 0, deadline: w.hour + 24, x: 16, y: 16, assignee: null }];
  check(!everyoneAsleep(w), 'an urgent job keeps the normal speed');
  w.errands = [];
  w.festival = { called: true, readyAt: 0, held: 0 };
  check(!everyoneAsleep(w), 'a festival still to come keeps the normal speed');
  w.festival.called = false;
  w.decisions = [{ kind: 'research', options: [] }];
  check(!everyoneAsleep(w), 'a waiting decision keeps the normal speed');
  w.decisions = [];
  check(everyoneAsleep(w), 'and asleep again once those are gone');
}

// someone wakes: the skip ends
runHours(w, 1);
while (everyoneAsleep(w) && hourOfDay(w) < 12) runHours(w, 1 / 6);
const woke = hourOfDay(w);
check(!everyoneAsleep(w) && woke >= 4 && woke < 9, `the skip ends when people wake (${woke.toFixed(1)}h)`);

console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exit(1);
