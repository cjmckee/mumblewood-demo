// Prepare a service-investing player case through real drafts, construction and worker assignments.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createWorld, tick, alive, avgMood, colonyComfort, edibleTotal, drinkableTotal, TICKS_PER_HOUR, workersAt, findSpot, apply, stockOf, tradeOf, bedridden, bdef } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { BUILDING_BY_ID, type InputKey } from '../src/sim/content';
const seed = 24757, w = createWorld(seed); let state = seed;
const rand = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
const actions: { hour: number; action: string }[] = [];
const decide = () => {
  while (w.decisions.length) {
    const d = w.decisions[0];
    if (d.kind === 'blueprint') {
      const target = ['tavern', ...(!w.owned.some(id => ['ciderpress', 'brewery'].includes(id)) ? ['ciderpress', 'brewery'] : [])].find(id => !w.owned.includes(id) && d.options.includes(id));
      if (target) { apply(w, { type: 'resolve', option: d.options.indexOf(target) }); actions.push({ hour: w.hour, action: `draft ${target}` }); continue; }
    }
    autoDecide(w, 'greedy', rand);
  }
};
const staff = (id: string) => {
  const b = w.buildings.find(b => b.def === id && b.built); if (!b || workersAt(w, b.uid).length) return;
  const c = alive(w).filter(c => tradeOf(w, c) == null && !bedridden(c) && c.errand == null).sort((a, z) => z.skills[bdef(b).job!] - a.skills[bdef(b).job!])[0];
  if (c) apply(w, { type: 'assign', colonist: c.id, building: b.uid });
};
let saved = false;
while (w.status === 'playing' && w.hour < 6 + 90 * 24) {
  decide();
  for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) { tick(w); decide(); }
  autoBuild(w);
  const producer = ['ciderpress', 'brewery'].find(id => w.owned.includes(id));
  for (const id of ['tavern', ...(producer ? [producer] : [])]) {
    if (!w.owned.includes(id) || w.buildings.some(b => b.def === id) || w.buildings.filter(b => !b.built).length >= 3) continue;
    if (!Object.entries(BUILDING_BY_ID[id].cost).every(([key, n]) => stockOf(w, key as InputKey) >= (n ?? 0))) continue;
    const spot = findSpot(w, id); if (spot && !apply(w, { type: 'place', def: id, ...spot })) actions.push({ hour: w.hour, action: `place ${id}` });
  }
  if (producer) staff(producer); staff('tavern');
  const tavern = w.buildings.find(b => b.def === 'tavern' && b.built), people = alive(w);
  if (w.chartersDone.length && tavern && workersAt(w, tavern.uid).length && drinkableTotal(w) >= people.length * 0.6 && edibleTotal(w) >= people.length && people.filter(c => c.lastDrink != null && c.lastDrink >= w.hour - 30).length >= people.length / 2) {
    mkdirSync('dist/comfort-recovery', { recursive: true });
    writeFileSync('dist/comfort-recovery/service-checkpoint.json', JSON.stringify({ world: w, decisionState: state, preparation: actions, metadata: { seed, hour: w.hour, pop: people.length, mood: avgMood(w), comfort: colonyComfort(w), food: edibleTotal(w), drinks: drinkableTotal(w), tavern: tavern.uid, producer, recentDrinkers: people.filter(c => c.lastDrink != null && c.lastDrink >= w.hour - 30).length } }));
    console.log(JSON.stringify({ hour: w.hour, pop: people.length, food: edibleTotal(w), drinks: drinkableTotal(w), actions })); saved = true; break;
  }
}
if (!saved) throw new Error(`No qualified service checkpoint: hour ${w.hour}, tavern ${w.buildings.some(b => b.def === 'tavern')}, owned ${w.owned.join(',')}`);
