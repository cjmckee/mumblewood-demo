// Completion is a saved acknowledgement, with no second payout or extra bot RNG.
import assert from 'node:assert/strict';
import { createWorld, debugGrow, runHours, apply, tick, standingOf, World } from '../src/sim/world';
import { autoDecide } from '../src/sim/autoplayer';
import { START } from '../src/sim/scenario';

function completed(tier: 1 | 2) {
  const w = createWorld(4242);
  debugGrow(w, 10);
  w.chartersDone = tier === 2 ? ['settled'] : [];
  w.charter = tier === 1 ? 'settled' : 'bread'; w.charterTier = tier;
  w.charterOffered = true; w.draftsFrom = 1; w.decisions = [];
  w.charterHolds = []; w.res.stew = 100; w.strain = 20;
  w.tally = { eaten: tier === 1 ? { stew: 30 } : { bread: 30 }, drunk: {}, made: {}, used: {} };
  w.moodLog = Array(24).fill(90);
  for (const c of w.colonists) c.mood = 90;
  runHours(w, 2);
  return w;
}

for (const tier of [1, 2] as const) {
  const w = completed(tier), d = w.decisions[0];
  assert.equal(d?.kind, 'charter-complete');
  if (d.kind !== 'charter-complete') throw new Error('missing completion');
  assert.equal(d.tier, tier); assert.equal(d.gold, START.trade.stipend[tier - 1]);
  assert.equal(d.strainAfter, w.strain); assert(d.strainAfter < d.strainBefore);
  assert.equal(standingOf(w), tier);
  assert.deepEqual(w.decisions.slice(0, 3).map(d => d.kind), ['charter-complete', 'charter', 'perk']);
  const before = JSON.stringify(w); tick(w);
  assert.equal(JSON.stringify(w), before, 'the celebration pauses simulation');
  // Use the persisted decision, as a save/resume would, rather than ephemeral UI state.
  const restored: World = JSON.parse(JSON.stringify(w));
  const expected = structuredClone(restored); expected.decisions.shift();
  assert.equal(apply(restored, { type: 'resolve', option: 0 }), null);
  assert.deepEqual(restored, expected, 'Continue only removes the notice, leaving rewards and choices unchanged');
  for (const style of ['greedy', 'random'] as const) {
    const withNotice = structuredClone(w), withoutNotice = structuredClone(w);
    withoutNotice.decisions.shift();
    let noticeCalls = 0, plainCalls = 0;
    autoDecide(withNotice, style, () => { noticeCalls++; return 0.25; });
    autoDecide(withoutNotice, style, () => { plainCalls++; return 0.25; });
    assert.equal(noticeCalls, plainCalls, 'no extra random choice is consumed by an acknowledgement');
    assert.deepEqual(withNotice, withoutNotice, 'bot outcome is unchanged by the celebration');
  }
}
// The third charter retains the win screen rather than promising another charter.
const final = createWorld(4242); debugGrow(final, 12);
final.chartersDone = ['settled', 'bread']; final.charterTier = 3; final.charter = 'hall';
const hall = final.buildings.find(b => b.def === 'hall');
if (!hall) {
  // Use the existing hall fixture shape; the completed monument itself is the win condition.
  final.buildings.push({ ...structuredClone(final.buildings[0]), uid: 9999, def: 'hall', built: true });
}
final.decisions = []; runHours(final, 1);
assert.equal(final.status, 'won');
assert(!final.decisions.some(d => d.kind === 'charter-complete'));
console.log('charter transitions: both standings, save data, pause, one-time rewards, choice order, bot RNG and final victory passed');
