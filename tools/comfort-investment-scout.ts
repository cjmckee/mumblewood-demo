// Locate affordable choices in normal play, before the bot's hourly construction.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createWorld, tick, alive, colonyComfort, avgMood, comfortGaps, strainPerDay, TICKS_PER_HOUR, findSpot, stockOf, sites } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { BUILDING_BY_ID, type InputKey } from '../src/sim/content';
const out = 'dist/comfort-investment'; mkdirSync(out, { recursive: true });
for (const seed of [1000, 24757, 42, 303]) {
  const w = createWorld(seed); let state = seed;
  const rand = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
  const found = new Set<string>();
  const inspect = () => {
    if (!w.chartersDone.length || w.decisions.length || sites(w).length >= 2) return;
    for (const id of ['stage', 'bathhouse', 'cottage']) {
      if (found.has(id) || !w.owned.includes(id) || w.buildings.some(b => b.def === id) || !findSpot(w, id)) continue;
      if (![id, 'kitchen'].every(def => Object.entries(BUILDING_BY_ID[def].cost).every(([r, n]) => stockOf(w, r as InputKey) >= (n ?? 0)))) continue;
      const metadata = { seed, id, hour: w.hour, strain: w.strain, rate: strainPerDay(w), mood: avgMood(w), comfort: colonyComfort(w), pop: alive(w).length, gaps: comfortGaps(w), charter: w.charter, chartersDone: w.chartersDone };
      writeFileSync(`${out}/${seed}-${id}-checkpoint.json`, JSON.stringify({ world: w, decisionState: state, metadata }));
      console.log(JSON.stringify(metadata)); found.add(id);
    }
  };
  while (w.status === 'playing' && w.hour < 6 + 80 * 24) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    inspect(); autoBuild(w);
  }
  console.log(JSON.stringify({ seed, found: [...found] }));
}
