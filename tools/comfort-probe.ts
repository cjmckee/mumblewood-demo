// Matched continuations from the first completed charter, without grants or bot-default changes.
// node --import tsx tools/comfort-probe.ts [seed=1000] [elapsedDayLimit=90]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createWorld, tick, day, alive, avgMood, colonyComfort, edibleTotal, TICKS_PER_HOUR, workersAt, World } from '../src/sim/world';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
import { START } from '../src/sim/scenario';
import { STRONG_COMFORT_CURVE, REWARD_COMFORT_CURVE, type ComfortScale } from '../src/sim/comfort';

const seed = Number(process.argv[2] ?? 1000), limit = Number(process.argv[3] ?? 90);
const out = `dist/comfort-probe/${seed}`; mkdirSync(out, { recursive: true });
const originalBot = structuredClone(BOT), originalScale = START.comfortScale;
let decisionState = seed;
const rand = () => ((decisionState = (decisionState * 1103515245 + 12345) >>> 0) / 4294967296);
const step = (w: World) => {
  autoDecide(w, 'greedy', rand);
  for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) {
    tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand);
  }
  autoBuild(w);
};
const start = createWorld(seed);
// The entire common history uses current rules and current bot defaults.
while (!start.chartersDone.length && start.status === 'playing' && start.hour + 1e-6 < 6 + limit * 24) step(start);
assert(start.status === 'playing' && start.chartersDone.length === 1, 'need a surviving first-charter checkpoint');
const fork = JSON.stringify(start), forkDecisionState = decisionState;
const hash = createHash('sha256').update(fork + ':' + forkDecisionState).digest('hex');
writeFileSync(`${out}/checkpoint.json`, JSON.stringify({ world: start, decisionState: forkDecisionState, hash }));
const profiles: { name: string; scale: ComfortScale }[] = [
  { name: 'current', scale: { base: 1.4, slope: 1 } },
  { name: 'strong', scale: { base: 1.4, slope: 1, curve: STRONG_COMFORT_CURVE } },
  { name: 'reward', scale: { base: 1.4, slope: 1, curve: REWARD_COMFORT_CURVE } },
];
const results = [];
try {
  for (const profile of profiles) for (const earlierComfort of [false, true]) {
    const w: World = JSON.parse(fork); decisionState = forkDecisionState;
    assert.equal(JSON.stringify(w), fork);
    START.comfortScale = profile.scale;
    Object.assign(BOT, structuredClone(originalBot), { comfortsFirst: earlierComfort });
    let samples = 0, comfort = 0, mood = 0, peakStrain = w.strain, minimumMood = 100;
    let minFood = edibleTotal(w), minWood = w.res.wood, sulkerHours = 0, serviceStaffHours = 0;
    const trace = [];
    while (w.status === 'playing' && w.hour + 1e-6 < 6 + limit * 24) {
      const before = w.hour; step(w); assert(w.hour > before, 'continuation must advance');
      const people = alive(w), c = colonyComfort(w), m = avgMood(w);
      samples++; comfort += c; mood += m; peakStrain = Math.max(peakStrain, w.strain);
      minimumMood = Math.min(minimumMood, ...people.map(c => c.mood));
      minFood = Math.min(minFood, edibleTotal(w)); minWood = Math.min(minWood, w.res.wood);
      sulkerHours += people.filter(c => c.sulking).length;
      serviceStaffHours += w.buildings.filter(b => b.built && ['tavern', 'clinic'].includes(b.def)).reduce((n, b) => n + workersAt(w, b.uid).length, 0);
      if (Math.round(w.hour) % 24 === 12 || w.status !== 'playing') trace.push({ hour: w.hour, day: day(w), pop: people.length, comfort: c, mood: m, strain: w.strain, food: edibleTotal(w), wood: w.res.wood, charter: w.charter, chartersDone: [...w.chartersDone], departures: w.stats.departures, deaths: w.stats.deaths });
    }
    const result = { seed, curve: profile.name, staffing: earlierComfort ? 'earlier-comfort' : 'standard', checkpointHash: hash,
      forkDay: day(start), observedHours: samples, status: w.status === 'playing' ? 'cutoff' : w.status,
      elapsedDays: (w.hour - 6) / 24, completedCharters: w.chartersDone.length,
      population: alive(w).length, departures: w.stats.departures - start.stats.departures, deaths: w.stats.deaths - start.stats.deaths,
      meanComfort: comfort / samples, meanMood: mood / samples, minimumMood, peakStrain, endStrain: w.strain,
      minFood, minWood, sulkerHours, serviceStaffHours,
      charterCompletions: w.log.filter(l => l.text.startsWith('Charter complete:')).map(l => ({ day: l.day, text: l.text })),
    };
    results.push(result);
    writeFileSync(`${out}/${profile.name}-${result.staffing}.json`, JSON.stringify({ result, trace }, null, 2));
    console.log(JSON.stringify(result));
  }
  writeFileSync(`${out}/summary.json`, JSON.stringify({ seed, limit, checkpointHash: hash, results }, null, 2));
} finally { START.comfortScale = originalScale; Object.assign(BOT, originalBot); }
