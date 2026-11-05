import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const roots = process.argv.slice(2);
if (!roots.length) roots.push('dist/strain-ablation');
const load = path => JSON.parse(readFileSync(path, 'utf8'));
const batches = roots.map(root => ({ root, data: load(`${root}/summary.json`) }));
const seeds = batches.flatMap(b => b.data.seeds);
assert.equal(new Set(seeds).size, seeds.length, 'no duplicated seed batches');
assert(batches.every(b => b.data.limit === batches[0].data.limit && b.data.botHash === batches[0].data.botHash));
const results = batches.flatMap(b => b.data.results);
const checkpoints = batches.flatMap(b => b.data.checkpoints);
const arms = ['current', 'gentler', 'no-growth', 'zero-strain'];
const commonWindows = [];
for (const checkpoint of checkpoints) {
  const seed = checkpoint.seed, rows = results.filter(r => r.seed === seed);
  assert.equal(rows.length, arms.length);
  assert(rows.every(r => r.checkpointHash === checkpoint.hash));
  const hours = Math.min(720, ...rows.map(r => r.observedHours));
  const root = batches.find(b => b.data.seeds.includes(seed)).root;
  for (const arm of arms) {
    const { trace } = load(`${root}/${seed}/${arm}.json`);
    const window = trace.filter(r => r.afterFork <= hours + 1e-6);
    assert.equal(window.length, hours);
    const last = window.at(-1);
    commonWindows.push({ seed, arm, observedHours: hours,
      meanMood: window.reduce((n, r) => n + r.mood, 0) / hours,
      meanStrain: window.reduce((n, r) => n + r.strain, 0) / hours,
      minimumMood: Math.min(...window.map(r => r.lowestMood)),
      endPopulation: last.population, endStrain: last.strain,
      completedCharters: last.chartersDone.length, departures: last.departures, deaths: last.deaths,
      sulkingPersonHours: last.sulkingPersonHours, daytimeSulkingPersonHours: last.daytimeSulkingPersonHours,
      personHours: last.personHours, hungryPersonHours: last.hungryPersonHours,
      festivals: last.festivals, festivalGoods: last.festivalGoods, storyEvents: last.storyEvents,
    });
  }
}
const median = values => { const a = [...values].sort((a, b) => a - b); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const aggregate = arms.map(arm => {
  const runs = results.filter(r => r.arm === arm), windows = commonWindows.filter(r => r.arm === arm);
  const pairedMoodGains = windows.map(r => r.meanMood - commonWindows.find(c => c.seed === r.seed && c.arm === 'current').meanMood);
  return { arm, cases: runs.length, wins: runs.filter(r => r.status === 'won').length,
    cutoffs: runs.filter(r => r.status === 'cutoff').length, collapses: runs.filter(r => r.status === 'lost').length,
    departures: runs.reduce((n, r) => n + r.departures, 0), deaths: runs.reduce((n, r) => n + r.deaths, 0),
    medianPairedCommonWindowMoodGain: median(pairedMoodGains),
    commonWindowDaytimeSulkingPersonHours: windows.reduce((n, r) => n + r.daytimeSulkingPersonHours, 0),
    commonWindowFestivalGoods: windows.reduce((n, r) => n + r.festivalGoods, 0),
    commonWindowDepartures: windows.reduce((n, r) => n + r.departures, 0),
    commonWindowDeaths: windows.reduce((n, r) => n + r.deaths, 0),
  };
});
const reference = load('docs/comfort-curve-results.json');
for (const seed of [1000, 24757]) {
  for (const [arm, oldCurve] of [['current', 'current'], ['gentler', 'reward']]) {
    const previous = reference.cases.find(c => c.seed === seed)?.results.find(r => r.curve === oldCurve && r.staffing === 'standard');
    const actual = results.find(r => r.seed === seed && r.arm === arm);
    if (actual && previous) {
      assert.equal(actual.checkpointHash, previous.checkpointHash);
      assert.equal(actual.status, previous.status);
      assert.equal(actual.elapsedDays, previous.elapsedDays);
      assert(Math.abs(actual.minimumMood - previous.minimumMood) < 1e-8);
    }
  }
}
writeFileSync('docs/strain-ablation-results.json', JSON.stringify({ sourceBaseCommit: 'c658d6cbcfe5a479f065bc794bf466ac98ed0dab',
  method: 'Default bot to first charter; four matched continuations to 90 elapsed days. No-growth retains inherited and event strain; zero-strain intercepts all strain writes at zero but retains inherited mood/history. Normal events and adaptive decisions remain active. Common windows are the first 30 days after each checkpoint or its earliest terminal arm, whichever comes first.',
  seeds, limit: batches[0].data.limit, botHash: batches[0].data.botHash, checkpoints,
  exclusions: batches.flatMap(b => b.data.exclusions), aggregate, commonWindows, results }, null, 2) + '\n');
console.log(JSON.stringify({ aggregate, windows: checkpoints.map(c => ({ seed: c.seed, hours: commonWindows.find(w => w.seed === c.seed).observedHours })) }, null, 2));
