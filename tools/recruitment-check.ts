// Run: npx tsx tools/recruitment-check.ts
import assert from 'node:assert/strict';
import { createWorld, debugGrow, recruitInterval } from '../src/sim/world';
import { seasonOf } from '../src/sim/seasons';
import { START } from '../src/sim/scenario';
const saved = START.seasons.recruitTaper;
try {
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
  console.log('recruitment: 5 checks passed');
} finally { START.seasons.recruitTaper = saved; }
