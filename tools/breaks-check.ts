// The mood ladder: inspiration, grumbling, breaks by trait, leaving. npx tsx tools/breaks-check.ts
import assert from 'node:assert/strict';
import { createWorld, alive, runHours, debugGrow, breakKindFor, built, bdef, apply, World, Colonist } from '../src/sim/world';
import { seasonOf } from '../src/sim/seasons';
import { MEALS } from '../src/sim/content';
const quiet = (w: World) => { w.nextEventHour = 1e9; w.decisions = []; };
const fresh = (seed: number) => { const w = createWorld(seed); quiet(w); debugGrow(w, 5); quiet(w); return w; };
const misery = (w: World, c: Colonist, v = -60) => { c.memories.push({ key: 'test', label: 'Test misery', value: v, until: w.hour + 200 }); c.mood = 50 + v; };
const hours = (w: World, n: number) => { for (let i = 0; i < n; i++) { quiet(w); runHours(w, 1); } };
let ok = 0; const check = (c: boolean, m: string) => { assert(c, m); ok++; };

check(seasonOf(createWorld(1)).season === 'spring', 'runs start in spring');

// the trait picks the break
{ const w = fresh(11); const c = alive(w)[0];
  for (const [traits, wants, kind] of [[['glutton'], [], 'binge'], [['loner'], [], 'wander'], [['grumbler'], [], 'brawl'], [[], ['tippler'], 'bender'], [[], [], 'sulk']] as const) {
    c.traits = [...traits]; c.wants = [...wants] as never; check(breakKindFor(w, c) === kind, `${traits.join(',') || wants.join(',') || 'no trait'} → ${kind}`);
  } }

// a sulk: refuses work, then calms down after 12-24 hours, and not again for 3 days
{ const w = fresh(12); const c = alive(w)[0]; c.traits = []; c.wants = []; const s0 = w.strain;
  misery(w, c); hours(w, 2);
  check(c.sulking && c.breakKind === 'sulk', 'a miserable settler sulks');
  check(w.strain >= s0 + 0.5 - 1e-9, 'a break adds strain');
  hours(w, 25); check(!c.sulking, 'the sulk ends within a day');
  hours(w, 10); check(!c.sulking, 'and no second break within 3 days'); }

// a binge eats the best meals
{ const w = fresh(13); const c = alive(w)[0]; c.traits = ['glutton']; c.wants = [];
  for (const r of MEALS) w.res[r] = 0; w.res.pie = 10; w.res.stew = 10;
  misery(w, c); hours(w, 2);
  check(c.breakKind === 'binge' && w.res.pie <= 6.01, `a binge eats the best meals first (pie ${w.res.pie})`); }

// a brawl lays up both
{ const w = fresh(14); const [c, d] = alive(w); c.traits = ['grumbler']; c.wants = [];
  for (const o of alive(w)) if (o !== c) w.opinions[`${c.id}>${o.id}`] = o === d ? -80 : 20;
  misery(w, c); hours(w, 2);
  check(c.breakKind === 'brawl', 'a grumbler brawls');
  check(c.illness?.id === 'bruised' && d.illness?.id === 'bruised', 'both are laid up bruised'); }

// a hothead smashes their workshop
{ const w = fresh(15); const c = alive(w)[0]; c.traits = ['hothead']; c.wants = [];
  const shop = built(w).find(b => bdef(b).recipes && bdef(b).job)!;
  assert(shop, 'a workshop to smash');
  apply(w, { type: 'assign', colonist: c.id, building: shop.uid }); c.job = shop.uid;
  shop.outbox = { wood: 5 } as never;
  misery(w, c); hours(w, 1);
  check(c.breakKind === 'smash', 'a hothead smashes');
  check(!shop.built && Object.keys(shop.outbox).length === 0, 'the workshop is wrecked and its shelves lost'); }

// inspiration
{ const w = fresh(16); const c = alive(w)[0]; c.traits = ['diligent'];
  misery(w, c, 45); hours(w, 3);
  check(c.inspiration === 'speed' && (c.inspiredUntil ?? 0) > w.hour, 'a happy diligent settler is inspired to speed');
  const d = alive(w)[1]; d.traits = []; misery(w, d, 45); hours(w, 3);
  check(d.inspiration === 'output', 'anyone else is inspired to extra output'); }

// grumbling spreads to housemates
{ const w = fresh(17); const [c, d] = alive(w); d.bed = c.bed; misery(w, c, -25); hours(w, 2);
  check(d.thoughts.some(t => t.label.includes('grumbling') && t.value === -2), 'a grumbling housemate costs −2'); }

// leaving: below 12 for a day, taking meals and adding strain
{ const w = fresh(18); const c = alive(w)[0]; c.traits = []; c.wants = []; w.res.stew = 20;
  misery(w, c, -90); const s0 = w.strain; hours(w, 30);
  check(c.left, 'a settler below 12 for a day leaves');
  check(w.res.stew <= 17.01 && w.strain >= s0 + 2, 'taking a few meals, and adding strain'); }

console.log(`mood ladder: ${ok} checks passed`);
