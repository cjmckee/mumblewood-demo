// The work wants: met through the work grid and who works where. npx tsx tools/work-wants-check.ts
import assert from 'node:assert/strict';
import { createWorld, alive, wantMet, wantSupported, runHours, apply, focusedPrios, World } from '../src/sim/world';
const w: World = createWorld(5); w.nextEventHour = 1e9; w.decisions = [];
const c = alive(w)[0]; const h = Math.floor(w.hour) + 100; w.hour = h;
const log = (kinds: string[]) => { c.worked = kinds.map((k, i) => ({ h: h - kinds.length + i + 1, k: k as never })); };
log(Array(8).fill('foraging')); assert(wantMet(w, c, 'outdoorsy'), 'outdoorsy: a day of foraging');
log([...Array(5).fill('cooking'), ...Array(3).fill('foraging')]); assert(!wantMet(w, c, 'outdoorsy'), 'outdoorsy: mostly in the kitchen is not enough');
log(['cooking', 'cooking']); assert(!wantMet(w, c, 'outdoorsy'), 'outdoorsy: needs a few hours of work first');
log(['cooking', 'foraging', 'hauling', 'hauling']); assert(!wantMet(w, c, 'restless'), 'restless: hauling is not a kind of work');
log(['cooking', 'foraging', 'building']); assert(wantMet(w, c, 'restless'), 'restless: three kinds');
log(['cooking', 'hauling']); assert(wantMet(w, c, 'aboveHauling'), 'above hauling: an hour of it is forgiven');
log(['hauling', 'cooking', 'hauling']); assert(!wantMet(w, c, 'aboveHauling'), 'above hauling: two hours is too many');
c.withFriendAt = h - 5; assert(wantMet(w, c, 'workBuddy'), 'work buddy: a shift with a friend today');
c.withFriendAt = h - 30; assert(!wantMet(w, c, 'workBuddy'), 'work buddy: not since yesterday');
for (const id of ['outdoorsy', 'restless', 'aboveHauling'] as const) assert(wantSupported(w, id), `${id} is always within reach`);
// the log fills itself in during the working day, and keeps three days
const fresh = createWorld(6); fresh.nextEventHour = 1e9;
for (const x of alive(fresh)) apply(fresh, { type: 'prios', colonist: x.id, prios: focusedPrios('foraging') });
for (let i = 0; i < 24 * 4; i++) { fresh.decisions = []; runHours(fresh, 1); }
// (the log trims as it's written, so judge it on whoever worked last)
const someone = alive(fresh).filter(x => (x.worked ?? []).length).sort((a, z) => z.worked!.at(-1)!.h - a.worked!.at(-1)!.h)[0];
assert(someone, 'working hours are logged');
const lastWorked = someone.worked!.at(-1)!.h;
assert((someone.worked ?? []).every(x => x.h > lastWorked - 72), 'the log keeps three days');
console.log('work wants: outdoorsy, restless, above hauling, work buddy and the work log passed');
