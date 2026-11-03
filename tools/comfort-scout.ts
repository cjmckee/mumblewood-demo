// Find naturally reached checkpoints for the bounded recovery studies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createWorld, tick, day, hourOfDay, alive, avgMood, beds, edibleTotal, drinkableTotal, TICKS_PER_HOUR, workersAt, World } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
const output = 'dist/comfort-recovery'; mkdirSync(output, { recursive: true });
for (const seed of [1000, 24757]) {
  const w = createWorld(seed); let state = seed;
  const rand = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
  const found = new Set<string>();
  const save = (kind: string) => {
    if (found.has(kind)) return;
    found.add(kind);
    const metadata = { seed, kind, hour: w.hour, day: day(w), pop: alive(w).length, beds: beds(w), food: edibleTotal(w), drinks: drinkableTotal(w), mood: avgMood(w), charter: w.charter, chartersDone: w.chartersDone, taverns: w.buildings.filter(b => b.def === 'tavern').map(b => ({ uid: b.uid, built: b.built, workers: workersAt(w, b.uid).length })) };
    writeFileSync(`${output}/${seed}-${kind}-checkpoint.json`, JSON.stringify({ world: w, decisionState: state, metadata }));
    console.log(JSON.stringify(metadata));
  };
  const inspect = () => {
    const population = alive(w).length;
    if (!w.chartersDone.length) return;
    if (w.chartersDone.length === 1 && population >= 6 && avgMood(w) >= 45 && edibleTotal(w) >= population * 3) save('food');
    if (w.decisions[0]?.kind === 'recruit' && beds(w) === population) save('housing');
    if (w.decisions[0]?.kind === 'recruit') save('recruit');
    if (w.chartersDone.length === 1 && avgMood(w) >= 40 && edibleTotal(w) >= population && drinkableTotal(w) >= population * 0.3 && hourOfDay(w) >= 18 && w.buildings.some(b => b.def === 'tavern' && b.built && workersAt(w, b.uid).length > 0)) save('service');
    if (w.chartersDone.length === 1 && beds(w) === population) save('full-beds');
  };
  while (w.status === 'playing' && w.hour < 6 + 90 * 24) {
    inspect(); autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) { tick(w); inspect(); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w); inspect();
  }
  console.log(seed, 'found', [...found]);
}
