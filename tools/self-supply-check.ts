// Workshop workers fetching their own ingredients (START.selfSupply): topping up before the workshop runs dry,
// taking over a far-off laborer's delivery, and carrying finished goods out on the same trip.
// npx tsx tools/self-supply-check.ts
import assert from 'node:assert/strict';
import { createWorld, apply, findSpot, alive, tick, reconcileStock, spotOf, storages, World } from '../src/sim/world';
import { START } from '../src/sim/scenario';

const DEFAULT = { ...START.selfSupply };
let checks = 0;
const ok = (cond: unknown, msg: string) => { assert(cond, msg); checks++; };

/** a built sawmill with one worker; everyone else is away, so no laborer interferes unless a check brings one back */
function setup(ss: Partial<typeof START.selfSupply> = {}) {
  Object.assign(START.selfSupply, DEFAULT, ss);
  const w: World = createWorld(42);
  w.nextEventHour = 1e9; w.decisions = [];
  w.hour = 8 * 24 + 10; // mid-morning in autumn: everyone is working
  w.owned.push('sawmill');
  const pos = findSpot(w, 'sawmill'); assert(pos);
  assert.equal(apply(w, { type: 'place', def: 'sawmill', ...pos }), null);
  const mill = w.buildings.at(-1)!; mill.built = true;
  const [worker, ...rest] = alive(w);
  assert.equal(apply(w, { type: 'assign', colonist: worker.id, building: mill.uid }), null);
  for (const c of [worker, ...rest]) { c.hunger = 100; c.fun = 80; c.task = null; c.carrying = null; }
  for (const c of rest) { c.job = null; c.left = true; }
  const s = spotOf(mill); worker.x = s.x; worker.y = s.y;
  w.res.wood = 80; reconcileStock(w); // leaves the stockpile room for planks
  return { w, mill, worker, rest };
}
/** one tick, waving away any decision that would pause the world */
const step = (w: World) => { while (w.decisions.length) apply(w, { type: 'resolve', option: 99 }); tick(w); };
const ticks = (w: World, n: number) => { for (let i = 0; i < n; i++) step(w); };

// 1. topping up: one plank's worth of wood left, refill due, nobody has claimed it
{
  const { w, mill, worker } = setup(); mill.inbox = { wood: 2 };
  ticks(w, 1);
  ok(worker.task?.kind === 'supply' && worker.task.res === 'wood', 'a worker tops up once a refill is due, before running dry');
}
{
  const { w, mill, worker } = setup({ topUpAt: 0 }); mill.inbox = { wood: 2 };
  ticks(w, 1);
  ok(worker.task == null && worker.activity === 'working', 'the old way: keep working until dry');
}

// 2. overtaking: dry, and the laborers who claimed the whole refill (24 wood) haven't picked it up yet
function claimed(near: boolean, ss: Partial<typeof START.selfSupply> = {}) {
  const r = setup(ss);
  const { w, mill, rest } = r; mill.inbox = {};
  const store = storages(w)[0], at = near ? spotOf(store) : { x: spotOf(mill).x + 30, y: spotOf(mill).y + 30 };
  rest.forEach((lab, i) => {
    lab.left = false; lab.x = at.x; lab.y = at.y;
    lab.task = { kind: 'supply', to: mill.uid, res: 'wood', amount: i ? 9 : 15, via: near ? store.uid : undefined };
  });
  return { ...r, theirs: rest.map(c => c.task) };
}
{
  const { w, mill, worker, rest, theirs } = claimed(false);
  ticks(w, 1);
  ok(worker.task?.kind === 'supply' && worker.task.to === mill.uid, 'a dry worker takes over a far-off laborer\u2019s delivery');
  ok(rest.filter((c, i) => c.task !== theirs[i]).length === 1, 'one laborer lets theirs go');
}
{
  const { w, mill, worker, rest, theirs } = claimed(true);
  ticks(w, 1);
  ok(worker.task == null, 'laborers already at storage keep their deliveries');
  ok(rest.every((c, i) => c.task === theirs[i] && c.task?.kind === 'supply' && c.task.to === mill.uid), '...and are still bringing them');
}
{
  const { w, worker } = claimed(false, { overtake: 0 });
  ticks(w, 1);
  ok(worker.task == null, 'overtake 0: always wait for the laborer');
}

// 3. round trip: finished planks go out, wood comes back
function roundTrip(ss: Partial<typeof START.selfSupply> = {}) {
  const { w, mill, worker } = setup(ss); mill.inbox = { wood: 2 }; mill.outbox = { planks: 8 };
  const planks0 = w.res.planks, kinds: string[] = [];
  for (let i = 0; i < 6 * 8 && !(kinds.at(-1) === 'supply' && worker.task == null); i++) {
    step(w);
    const k = worker.task?.kind ?? (kinds.length ? 'none' : ''); if (k && kinds.at(-1) !== k) kinds.push(k);
  }
  return { w, mill, worker, planks0, kinds };
}
{
  const { w, mill, planks0, kinds } = roundTrip();
  ok(kinds[0] === 'haul', `the worker takes the planks first (${kinds.join(' → ')})`);
  ok(kinds.indexOf("supply") > 0, `then brings wood back from storage (${kinds.join(" → ")})`);
  ok(w.res.planks >= planks0 + 8 - 1e-6 || (mill.outbox.planks ?? 0) < 8, 'the planks reach storage');
  ok((mill.inbox.wood ?? 0) > 2, 'the wood reaches the sawmill');
}
{
  const { kinds } = roundTrip({ roundTrip: false });
  ok(kinds[0] === 'supply' && !kinds.includes('haul'), `no round trip: straight for the wood (${kinds.join(' → ')})`);
}

Object.assign(START.selfSupply, DEFAULT);
console.log(`self supply: ${checks} checks passed`);
