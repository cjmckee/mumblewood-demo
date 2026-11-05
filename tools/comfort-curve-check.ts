import assert from 'node:assert/strict';
import { comfortMultiplier, STRONG_COMFORT_CURVE, REWARD_COMFORT_CURVE } from '../src/sim/comfort';
import { START } from '../src/sim/scenario';
import { createWorld, comfortFactor, runHours } from '../src/sim/world';

const scale = { base: 1.4, slope: 1 };
assert.equal(START.comfortScale.curve, undefined, 'prototype does not change shipped balance');
for (let i = 0; i <= 100; i++) {
  const value = i / 100;
  assert.equal(comfortMultiplier(value, scale), Math.max(0.2, 1.4 - value));
}
for (const curve of [STRONG_COMFORT_CURVE, REWARD_COMFORT_CURVE]) {
  const candidate = { ...scale, curve };
  let previous = Infinity;
  for (let i = 0; i <= 1000; i++) {
    const factor = comfortMultiplier(i / 1000, candidate);
    assert(Number.isFinite(factor) && factor >= 0.2 && factor <= curve[0][1]);
    assert(factor <= previous + 1e-12, 'improving comfort never increases strain growth'); previous = factor;
  }
  for (const [value, factor] of curve) {
    assert(Math.abs(comfortMultiplier(value, candidate) - factor) < 1e-12);
    assert(Math.abs(comfortMultiplier(value - 1e-8, candidate) - comfortMultiplier(value + 1e-8, candidate)) < 1e-6, 'no cliffs at curve points');
  }
  assert.equal(comfortMultiplier(-1, candidate), curve[0][1]);
  assert.equal(comfortMultiplier(2, candidate), 0.2);
}
assert(Math.abs(comfortMultiplier(0.75, { ...scale, curve: STRONG_COMFORT_CURVE }) - 0.65) < 1e-12);
const saved = START.comfortScale;
try {
  const w = createWorld(42); w.comfort = 0.5;
  START.comfortScale = { ...scale, curve: STRONG_COMFORT_CURVE };
  const normal = comfortFactor(w); w.perks.push('homesteaders');
  assert(comfortFactor(w) < normal);
  assert.equal(comfortFactor(w, 1), 0.2, 'perk saturation retains the positive growth floor');
  // Real hourly accumulation follows the selected curve; it never directly changes needs or rewards.
  const baseline = createWorld(42), candidate = structuredClone(baseline);
  START.comfortScale = scale; runHours(baseline, 1);
  START.comfortScale = { ...scale, curve: STRONG_COMFORT_CURVE }; runHours(candidate, 1);
  assert(baseline.strain > 0 && candidate.strain > 0);
  assert(Math.abs(candidate.strain * 2 - baseline.strain) < 1e-10, 'full-comfort hourly growth is half the baseline');
  assert.deepEqual(candidate.res, baseline.res);
  assert.equal(candidate.gold, baseline.gold);
} finally { START.comfortScale = saved; }
console.log('comfort curve: unchanged default, bounds, continuity, monotonicity, interpolation, perks and hourly integration passed');
