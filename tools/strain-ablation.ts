// Closed-loop causal diagnostic, never a production balance change.
// node --import tsx tools/strain-ablation.ts [comma-separated seeds] [elapsed-day cutoff]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createWorld, tick, alive, avgMood, colonyComfort, edibleTotal, TICKS_PER_HOUR, charterRequirements, World } from '../src/sim/world';
import { autoBuild, autoDecide, BOT } from '../src/sim/autoplayer';
import { START } from '../src/sim/scenario';
import { REWARD_COMFORT_CURVE } from '../src/sim/comfort';

const seeds = (process.argv[2] ?? '1000,24757,7,42,101,202,303,404').split(',').map(Number);
const limit = Number(process.argv[3] ?? 90);
assert(seeds.length && seeds.every(Number.isSafeInteger) && new Set(seeds).size === seeds.length);
assert(limit > 0 && Number.isFinite(limit));
const out = process.env.STRAIN_OUT ?? 'dist/strain-ablation'; mkdirSync(out, { recursive: true });
const originalRate = START.strain.rate, originalScale = START.comfortScale;
const botHash = createHash('sha256').update(JSON.stringify(BOT)).digest('hex');
const arms = ['current', 'gentler', 'no-growth', 'zero-strain'] as const;
type Arm = typeof arms[number];
const results = [], checkpoints = [], exclusions = [];
const festivalGoods = (w: World) => Object.entries(w.flows).filter(([k]) => k.endsWith(':-festival')).reduce((n, [, v]) => n + v, 0);
const daytimeSulking = (w: World) => Object.entries(w.flows).filter(([k]) => /^time:(worker|laborer):sulking$/.test(k)).reduce((n, [, v]) => n + v, 0);
const storyEvents = (w: World) => Object.values(w.story?.counts ?? {}).reduce((n, v) => n + v, 0);
try {
  for (const seed of seeds) {
    START.strain.rate = originalRate; START.comfortScale = originalScale;
    const start = createWorld(seed); let decisionState = seed;
    const rand = () => ((decisionState = (decisionState * 1103515245 + 12345) >>> 0) / 4294967296);
    const step = (w: World, arm: Arm = 'current', expose: () => void = () => {}) => {
      const enforce = () => { if (arm === 'zero-strain') w.strain = 0; };
      enforce(); autoDecide(w, 'greedy', rand); enforce();
      for (let t = 0; t < TICKS_PER_HOUR && w.status === 'playing'; t++) {
        expose(); tick(w); enforce();
        if (w.decisions.length) { autoDecide(w, 'greedy', rand); enforce(); }
      }
      autoBuild(w); enforce();
    };
    while (!start.chartersDone.length && start.status === 'playing' && start.hour < 6 + limit * 24) step(start);
    if (start.status !== 'playing' || start.chartersDone.length !== 1) {
      const excluded = { seed, reason: 'No surviving first-charter checkpoint within cutoff', status: start.status, hour: start.hour };
      exclusions.push(excluded); console.log(JSON.stringify(excluded)); continue;
    }
    const serialized = JSON.stringify(start), forkDecisionState = decisionState;
    const hash = createHash('sha256').update(serialized + ':' + forkDecisionState).digest('hex');
    const checkpoint = { seed, hash, hour: start.hour, strain: start.strain, population: alive(start).length, decisionState: forkDecisionState };
    checkpoints.push(checkpoint); mkdirSync(`${out}/${seed}`, { recursive: true });
    writeFileSync(`${out}/${seed}/checkpoint.json`, JSON.stringify({ ...checkpoint, world: start }));
    for (const arm of arms) {
      const w: World = JSON.parse(serialized); decisionState = forkDecisionState;
      assert.equal(JSON.stringify(w), serialized);
      START.strain.rate = arm === 'no-growth' || arm === 'zero-strain' ? 0 : originalRate;
      START.comfortScale = { base: 1.4, slope: 1, ...(arm === 'gentler' ? { curve: REWARD_COMFORT_CURVE } : {}) };
      // Intercept every write so strain remains zero even inside a tick or a batch
      // of decisions. Existing mood, memories, sulking and charter history remain.
      if (arm === 'zero-strain') Object.defineProperty(w, 'strain', { get: () => 0, set: () => {}, enumerable: true, configurable: true });
      const seen = new WeakSet(w.log), events: ({ absoluteHour: number } & World['log'][number])[] = [];
      const collect = () => { for (const log of w.log) if (!seen.has(log)) { seen.add(log); events.push({ absoluteHour: w.hour, ...log }); } };
      const exposure = { personHours: 0, sulkingPersonHours: 0, hungryPersonHours: 0, moodBelow10PersonHours: 0 };
      const expose = () => { for (const c of alive(w)) {
        exposure.personHours += 1 / TICKS_PER_HOUR;
        if (c.sulking) exposure.sulkingPersonHours += 1 / TICKS_PER_HOUR;
        if (c.hunger < 25) exposure.hungryPersonHours += 1 / TICKS_PER_HOUR;
        if (c.mood < 10) exposure.moodBelow10PersonHours += 1 / TICKS_PER_HOUR;
      } };
      const completions: { hour: number; charter: string }[] = [];
      let previousCharters = w.chartersDone.length, moodSum = 0, strainSum = 0, samples = 0;
      let moodOnlyBlockedHours = 0, nonMoodBlockedHours = 0;
      let firstTenDays: object | null = null;
      const trace = [];
      while (w.status === 'playing' && w.hour < 6 + limit * 24 - 1e-6) {
        const reqs = charterRequirements(w);
        if (reqs.some(r => r.metric.kind === 'avgMood' && r.ratio < 1) && reqs.every(r => r.metric.kind === 'avgMood' || r.ratio >= 1)) moodOnlyBlockedHours++;
        if (reqs.some(r => r.metric.kind !== 'avgMood' && r.ratio < 1)) nonMoodBlockedHours++;
        const before = w.hour; step(w, arm, expose); collect(); assert(w.hour > before);
        for (const charter of w.chartersDone.slice(previousCharters)) completions.push({ hour: w.hour, charter });
        previousCharters = w.chartersDone.length;
        const people = alive(w), meanMood = avgMood(w);
        samples++; moodSum += meanMood; strainSum += w.strain;
        const row = { hour: w.hour, afterFork: w.hour - start.hour, population: people.length,
          mood: meanMood, lowestMood: Math.min(...people.map(c => c.mood)), strain: w.strain, comfort: colonyComfort(w),
          food: edibleTotal(w), charter: w.charter, chartersDone: [...w.chartersDone],
          departures: w.stats.departures - start.stats.departures, deaths: w.stats.deaths - start.stats.deaths,
          festivals: (w.festival?.held ?? 0) - (start.festival?.held ?? 0), festivalGoods: festivalGoods(w) - festivalGoods(start),
          daytimeSulkingPersonHours: daytimeSulking(w) - daytimeSulking(start), storyEvents: storyEvents(w) - storyEvents(start),
          ...exposure };
        trace.push(row);
        if (w.hour - start.hour >= 240 - 1e-6 && firstTenDays == null) firstTenDays = {
          observedHours: samples, meanMood: moodSum / samples, meanStrain: strainSum / samples,
          minimumMood: Math.min(...trace.map(r => r.lowestMood)), endStrain: w.strain,
          departures: row.departures, deaths: row.deaths, festivals: row.festivals, festivalGoods: row.festivalGoods,
          daytimeSulkingPersonHours: row.daytimeSulkingPersonHours, storyEvents: row.storyEvents,
          moodOnlyBlockedHours, nonMoodBlockedHours, ...exposure,
        };
      }
      const last = trace.at(-1)!;
      assert.equal(createHash('sha256').update(JSON.stringify(BOT)).digest('hex'), botHash, 'bot policy unchanged');
      if (arm === 'zero-strain') assert(trace.every(r => r.strain === 0));
      const summary = { seed, arm, checkpointHash: hash, forkHour: start.hour, initialStrain: start.strain,
        status: w.status === 'playing' ? 'cutoff' : w.status, elapsedDays: (w.hour - 6) / 24,
        observedHours: samples, completedCharters: w.chartersDone.length, completions,
        departures: last.departures, deaths: last.deaths, festivals: last.festivals, festivalGoods: last.festivalGoods,
        daytimeSulkingPersonHours: last.daytimeSulkingPersonHours, storyEvents: last.storyEvents,
        minimumMood: Math.min(...trace.map(r => r.lowestMood)), peakStrain: Math.max(start.strain * (arm === 'zero-strain' ? 0 : 1), ...trace.map(r => r.strain)),
        endStrain: w.strain, moodOnlyBlockedHours, nonMoodBlockedHours, ...exposure, firstTenDays };
      results.push(summary);
      writeFileSync(`${out}/${seed}/${arm}.json`, JSON.stringify({ summary, trace, events }, null, 2));
      console.log(JSON.stringify(summary));
    }
  }
  writeFileSync(`${out}/summary.json`, JSON.stringify({ seeds, limit, botHash, checkpoints, exclusions, results }, null, 2));
} finally { START.strain.rate = originalRate; START.comfortScale = originalScale; }
