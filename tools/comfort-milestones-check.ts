import assert from 'node:assert/strict';
import { milestoneView, milestoneRewards, rollDouble, MilestoneState } from '../src/sim/comfort-milestones';
import { createWorld, alive, apply, findSpot, enableComfortMilestones, tick, TICKS_PER_HOUR, comfortMilestoneView, OUTBOX_CAP, strainPerDay } from '../src/sim/world';
const state = (): MilestoneState => ({ profile: 'balanced', history: [], rng: 12345, eligibleBatches: 0, bonusBatches: 0, bonusUnits: 0 });
const s = state();
s.history = Array.from({ length: 24 }, (_, i) => ({ hour: i + 1, homes: 0.65, meals: 0.5, evenings: 0.45 }));
assert.equal(milestoneView(s, 0, 24).level, 3);
assert.equal(milestoneView(s, 1, 24).level, 1, 'new charter raises requirements on the same rolling data');
assert.equal(milestoneView({ ...s, history: s.history.slice(1) }, 0, 24).level, 0, 'requires a full day, no invented prehistory');
assert.equal(milestoneView(s, 0, 25).ready, false, 'stale samples expire');
s.history = s.history.map(x => ({ ...x, homes: 0.65, meals: 0.55, evenings: 0.5 }));
assert.equal(milestoneView(s, 1, 24).level, 3, 'threshold equality counts');
s.history[23].homes = 0;
assert.equal(milestoneView(s, 1, 24).level, 2, 'tracks switch at the rolling threshold, without another grace timer');
assert.deepEqual(milestoneRewards('balanced', 3), { strain: 0.95, speed: 1.05, doubleChance: 0.05 });
assert.deepEqual(milestoneRewards('abundance', 3), { strain: 0.95, speed: 1, doubleChance: 0.1 });
const rolls = state(); let doubled = 0;
for (let i = 0; i < 100000; i++) if (rollDouble(rolls, 0.05)) doubled++;
assert(doubled > 4700 && doubled < 5300, 'seeded batch doubling has the expected frequency');
const saved = structuredClone(rolls);
assert.equal(rollDouble(rolls, 0.05), rollDouble(saved, 0.05), 'saved random stream resumes exactly');
const unchanged = rolls.rng; assert.equal(rollDouble(rolls, 0), false); assert.equal(rolls.rng, unchanged);

// Real production tick: a guaranteed winning roll must preserve full doubled output
// when only the base batch fits on the shelf, including across save/load.
const w = createWorld(42);
assert.equal(w.comfortMilestones, undefined, 'default game has no milestone rewards');
w.owned.push('kitchen'); const spot = findSpot(w, 'kitchen')!;
assert.equal(apply(w, { type: 'place', def: 'kitchen', ...spot }), null);
const b = w.buildings.at(-1)!; b.built = true;
const worker = alive(w)[0];
assert.equal(apply(w, { type: 'assign', colonist: worker.id, building: b.uid }), null);
b.inbox.berries = 30;
enableComfortMilestones(w, 'balanced');
const perfect = () => { w.comfortMilestones!.history = Array.from({ length: 24 }, (_, i) => ({ hour: Math.floor(w.hour) - 23 + i, homes: 1, meals: 1, evenings: 1 })); };
for (let i = 0; i < 24 * TICKS_PER_HOUR && !(worker.activity === 'working' && worker.goalReached); i++) { perfect(); tick(w); }
assert(worker.goalReached && worker.activity === 'working'); perfect();
assert.equal(comfortMilestoneView(w).level, 3);
const boosted = JSON.parse(JSON.stringify(w)), plain = JSON.parse(JSON.stringify(w));
delete plain.comfortMilestones;
for (const world of [boosted, plain]) {
  const kitchen = world.buildings.find((x: { uid: number }) => x.uid === b.uid)!;
  kitchen.outbox = {}; kitchen.batch = { output: 'stew', make: 3, done: 0, rate: 1, indoor: true };
}
assert(Math.abs(strainPerDay(boosted) / strainPerDay(plain) - 0.95) < 1e-9);
tick(boosted); tick(plain);
const progress = (world: typeof w) => world.buildings.find(x => x.uid === b.uid)!.batch!.done;
assert(Math.abs(progress(boosted) / progress(plain) - 1.05) < 1e-9, 'reward increases real workshop progress');
for (let seed = 1; seed < 10000; seed++) {
  const test = state(); test.rng = seed;
  if (rollDouble(test, 0.05)) { w.comfortMilestones!.rng = seed; break; }
}
for (const c of alive(w).slice(1)) { c.sulking = true; c.task = null; c.carrying = null; }
b.outbox = { stew: 12 }; b.batch = { output: 'stew', make: 3, done: 2.99, rate: 100, indoor: true };
const before = w.flows['stew:+kitchen'] ?? 0;
tick(w);
assert.equal(b.outbox.stew, OUTBOX_CAP);
assert.deepEqual(b.comfortBonus, { output: 'stew', amount: 3 });
const restored = JSON.parse(JSON.stringify(w));
const rb = restored.buildings.find((x: { uid: number }) => x.uid === b.uid)!;
rb.outbox = {};
for (const c of alive(restored)) c.sulking = true;
tick(restored);
assert.equal(rb.outbox.stew, 3);
assert.equal(rb.comfortBonus, undefined);
assert.equal(restored.flows['stew:+kitchen'] - before, 6, 'the whole batch doubled without overflow or lost bonus');
assert.equal(restored.flows['stew:comfort-bonus'], 3);
console.log('comfort milestones: thresholds, warmup, rolling expiry, reward profiles, seeded probability, full-batch output, shelf backpressure and save/resume passed');
