// Run: npx tsx tools/recruitment-check.ts
import assert from 'node:assert/strict';
import { createWorld, debugGrow, recruitInterval, popTarget, OPEN_ROAD_EXTRA } from '../src/sim/world';
import { seasonOf } from '../src/sim/seasons';
import { START } from '../src/sim/scenario';
const saved = START.seasons.recruitTaper, targets = START.popTargets;
try {
  // the optional taper, with population intent out of the way
  START.popTargets = [99, 99, 99];
  const w = createWorld(42);
  const base = START.seasons.recruitEvery[seasonOf(w).season];
  START.seasons.recruitTaper = undefined;
  assert.equal(recruitInterval(w), base, 'default remains seasonal');
  START.seasons.recruitTaper = { from: 10, later: 13, multiplier: 2, laterMultiplier: 4 };
  assert.equal(recruitInterval(w), base, 'early offers unchanged');
  debugGrow(w, 10);
  assert.equal(recruitInterval(w), base * 2, 'offers slow at ten people');
  debugGrow(w, 13);
  assert.equal(recruitInterval(w), base * 4, 'offers taper further at thirteen');
  w.perks.push('openRoad');
  assert.equal(recruitInterval(w), 1, 'Open road still offers daily arrivals');
  START.seasons.recruitTaper = saved; START.popTargets = targets;

  // population intent: each charter tier's colony, and no offers at it until the next tier
  const p = createWorld(42);
  assert.equal(popTarget(p), targets[0], 'tier 1 is sized for the first target');
  assert.equal(recruitInterval(p), base, 'offers at the season pace below it');
  debugGrow(p, targets[0]);
  assert.equal(recruitInterval(p), 0, 'no offers at the stage size');
  p.charterTier = 2;
  assert.equal(recruitInterval(p), base, 'offers return when the next tier asks for more');
  p.charterTier = 3; debugGrow(p, targets[2]);
  assert.equal(recruitInterval(p), 0, 'none at the finale size');
  p.perks.push('openRoad');
  assert.equal(popTarget(p), targets[2] + OPEN_ROAD_EXTRA, 'Open road makes room for a couple more');
  assert.equal(recruitInterval(p), 1, 'and offers daily until then');
  debugGrow(p, targets[2] + OPEN_ROAD_EXTRA);
  assert.equal(recruitInterval(p), 0, 'but stops at its larger size too');
  console.log('recruitment: 13 checks passed');
} finally { START.seasons.recruitTaper = saved; START.popTargets = targets; }
