// Run: npx tsx tools/event-context-check.ts
import assert from 'node:assert/strict';
import { createWorld, eventFits } from '../src/sim/world';
import { EVENTS } from '../src/sim/content';
const w = createWorld(42);
const req = EVENTS.find(e => e.id === 'blight')!.requires;
assert.equal(req, 'crops');
assert.equal(eventFits(w, req), false, 'no crop buildings: no blight');
const crop = { ...w.buildings[0], uid: w.nextUid++, def: 'field', built: false };
w.buildings.push(crop);
assert.equal(eventFits(w, req), false, 'planned field is not a growing crop');
crop.built = true;
assert.equal(eventFits(w, req), true, 'built field makes blight relevant');
crop.def = 'orchard';
assert.equal(eventFits(w, req), true, 'orchards can also be blighted');
console.log('event context: 5 checks passed');
