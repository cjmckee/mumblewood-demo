// Pausing a workplace, and workplaces the season stops. npx tsx tools/pause-check.ts
import assert from 'node:assert/strict';
import { createWorld, apply, alive, built, bdef, hasWork, workersAt, runHours } from '../src/sim/world';
import { buildingStatus } from '../src/ui/status';
const w = createWorld(31); w.nextEventHour = 1e9; w.decisions = [];
const shop = built(w).find(b => bdef(b).job && bdef(b).slots && hasWork(w, b))!;
assert(shop, 'a workplace with work');
assert.equal(apply(w, { type: 'pause', building: shop.uid, paused: true }), null);
assert(!hasWork(w, shop), 'a paused workplace has no work');
assert.equal(buildingStatus(w, shop).label, 'Paused');
assert(!buildingStatus(w, shop).warning, 'paused is not a warning');
runHours(w, 2); w.decisions = [];
assert.equal(workersAt(w, shop.uid).length, 0, 'nobody works at a paused workplace');
apply(w, { type: 'pause', building: shop.uid, paused: false });
assert(hasWork(w, shop) && !shop.paused, 'resumed');
// a field in winter is dormant, not a warning
const f = createWorld(32, { startDate: { season: 'winter', day: 2 } }); f.owned.push('field');
const field = { ...built(f)[0], uid: 9999, def: 'field', built: true } as typeof built extends (...a: never[]) => (infer B)[] ? B : never;
f.buildings.push(field as never);
assert.equal(buildingStatus(f, field as never).label, 'Dormant for the season');
assert(!buildingStatus(f, field as never).warning, 'dormant is not a warning');
console.log('pause: paused workplaces, resuming, and dormant fields passed');
void alive;
