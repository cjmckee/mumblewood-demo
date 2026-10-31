// Recipe slots and per-building ingredient options.
// npx tsx tools/slots-check.ts
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, SLOTS, isGroup, membersOf, inputName, InputKey } from '../src/sim/content';
import { createWorld, findSpot, apply, alive, runHours, reconcileStock, debugGrow, blockedReason, optionsOf, World } from '../src/sim/world';

/** a kitchen making only stew, staffed by one cook, with plenty of berries and fish in storage */
function kitchenWorld(seed: number) {
  const w = createWorld(seed); w.nextEventHour = 1e9; debugGrow(w, 6);
  const spot = findSpot(w, 'kitchen'); assert(spot); assert.equal(apply(w, { type: 'place', def: 'kitchen', ...spot }), null);
  const k = w.buildings.at(-1)!; k.built = true; k.off = [1, 2];
  w.res.berries = 50; w.res.fish = 30; w.res.wood = 30; reconcileStock(w);
  for (const c of alive(w)) apply(w, { type: 'assign', colonist: c.id, building: null });
  apply(w, { type: 'assign', colonist: alive(w)[0].id, building: k.uid });
  return { w, k };
}
const play = (w: World, hours: number) => { for (let h = 0; h < hours; h++) { while (w.decisions.length) apply(w, { type: 'resolve', option: 99 }); runHours(w, 1); } };
let n = 0; const ok = (cond: unknown, msg: string) => { assert(cond, msg); n++; };

// 1. Baseline: stew takes any raw food.
{
  const { w } = kitchenWorld(7); play(w, 36);
  ok((w.flows['stew:+kitchen'] ?? 0) > 2, 'the kitchen makes stew from raw food');
}

// 2. Switching fish off keeps it out of this kitchen's stew.
{
  const { w, k } = kitchenWorld(7);
  ok(apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: 'fish', on: false }) === null, 'fish can be switched off as a raw food');
  ok(optionsOf(k, 'rawFood').length === membersOf('rawFood').length - 1 && !optionsOf(k, 'rawFood').includes('fish'), 'the kitchen now takes every raw food but fish');
  play(w, 36);
  ok((w.flows['stew:+kitchen'] ?? 0) > 2, 'stew is still made');
  ok(!(w.flows['fish:-kitchen'] ?? 0), 'no fish went into it');
  ok((w.flows['berries:-kitchen'] ?? 0) > 0, 'berries did');
  ok(!(k.inbox.fish ?? 0), 'no fish was carried in');
}

// 3. Fish already in the inbox goes back to storage when switched off.
{
  const { w, k } = kitchenWorld(11); k.inbox.fish = 6; w.res.fish -= 6; reconcileStock(w);
  apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: 'fish', on: false });
  play(w, 24);
  ok((k.inbox.fish ?? 0) < 1e-6, 'switched-off fish is hauled out of the inbox');
  ok(!(w.flows['fish:-kitchen'] ?? 0), 'and never cooked');
}

// 4. Every option off: the kitchen says so and makes nothing.
{
  const { w, k } = kitchenWorld(7);
  for (const g of membersOf('rawFood')) apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: g, on: false });
  ok(blockedReason(w, k) === 'Every kind of raw food is switched off here.', `blocked reason names the switched-off input (got "${blockedReason(w, k)}")`);
  play(w, 24);
  ok(!(w.flows['stew:+kitchen'] ?? 0), 'no stew with every raw food switched off');
  apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: 'berries', on: true });
  ok(optionsOf(k, 'rawFood').join() === 'berries', 'switching one back on allows just that one');
}

// 5. Commands that make no sense are refused, and nothing is recorded.
{
  const { w, k } = kitchenWorld(7);
  ok(apply(w, { type: 'toggleOption', building: k.uid, key: 'drink', good: 'ale', on: false }) !== null, 'no recipe here takes drinks');
  ok(apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: 'planks', on: false }) !== null, 'planks are not a raw food');
  ok(apply(w, { type: 'toggleOption', building: k.uid, key: 'fish' as InputKey, good: 'fish', on: false }) !== null, 'a single good is not a group');
  ok(k.skip === undefined, 'refused commands leave no switches behind');
  apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: 'fish', on: false });
  apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: 'fish', on: true });
  ok(k.skip === undefined, 'switching back on clears the record, so saves stay as before');
}

// 6. Switches survive a save, as plain data.
{
  const { w, k } = kitchenWorld(7);
  apply(w, { type: 'toggleOption', building: k.uid, key: 'rawFood', good: 'mushrooms', on: false });
  const back = JSON.parse(JSON.stringify(w)) as World, k2 = back.buildings.find(b => b.uid === k.uid)!;
  ok(!optionsOf(k2, 'rawFood').includes('mushrooms'), 'a reloaded kitchen keeps its switches');
}

// 7. A named slot works as a recipe input, like a category.
{
  const stew = BUILDING_BY_ID.kitchen.recipes![0], saved = stew.inputs;
  SLOTS.testFilling = { name: 'test filling', members: ['berries', 'fish'] };
  try {
    stew.inputs = { testFilling: 0.9 } as typeof stew.inputs;
    ok(isGroup('testFilling') && inputName('testFilling' as InputKey) === 'test filling' && membersOf('testFilling' as InputKey).length === 2, 'a slot names its options');
    const { w, k } = kitchenWorld(7);
    apply(w, { type: 'toggleOption', building: k.uid, key: 'testFilling' as InputKey, good: 'berries', on: false });
    play(w, 36);
    ok((w.flows['stew:+kitchen'] ?? 0) > 2, 'a slot recipe runs');
    ok((w.flows['fish:-kitchen'] ?? 0) > 0 && !(w.flows['berries:-kitchen'] ?? 0), 'it uses only the options left on');
    ok(!(w.flows['mushrooms:-kitchen'] ?? 0), 'and nothing outside the slot');
  } finally { stew.inputs = saved; delete SLOTS.testFilling; }
}

console.log(`slots: ${n} checks passed`);
