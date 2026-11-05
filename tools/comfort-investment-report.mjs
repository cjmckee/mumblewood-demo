import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const root = 'dist/comfort-investment';
const load = name => JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
const cases = ['24757-cottage', '42-cottage', '1000-stage', '303-stage'];
const curves = ['current', 'gentler', 'no-growth'], policies = ['comfort', 'production', 'save'];
const checkpoints = [], results = [], windows = [];
for (const name of cases) {
  const { metadata } = load(`${name}-checkpoint.json`);
  checkpoints.push({ case: name, ...metadata });
  const runs = curves.flatMap(curve => policies.map(policy => load(`${name}-${curve}-${policy}.json`)));
  assert.equal(new Set(runs.map(r => r.summary.checkpointHash)).size, 1);
  const commonHours = Math.min(336, ...runs.map(r => r.summary.observedHours));
  for (const { summary, trace } of runs) {
    results.push(summary);
    assert(summary.curve !== 'no-growth' || summary.passiveGrowth === 0);
    assert(summary.policy === 'save' || summary.completionHour != null, 'project must actually be built');
    for (const hours of [...new Set([Math.min(168, commonHours), commonHours])]) {
      const rows = trace.filter(r => r.at > 0 && r.at <= hours + 1e-6), last = rows.at(-1);
      assert.equal(rows.length, hours);
      windows.push({ case: name, curve: summary.curve, policy: summary.policy, hours,
        meanMood: rows.reduce((n, r) => n + r.mood, 0) / hours,
        meanComfort: rows.reduce((n, r) => n + r.comfort, 0) / hours,
        minimumMood: Math.min(...rows.map(r => r.lowestMood)),
        passiveGrowth: last.passiveGrowth, eventStrain: last.eventStrain, relief: last.relief,
        daytimeSulking: last.daytimeSulking, foodMade: last.foodMade,
        endFood: last.food, endWood: last.wood, endFine: last.fine, endPopulation: last.population,
        endStrain: last.strain, departures: last.departures, deaths: last.deaths,
        addedCharters: last.chartersDone.length - metadata.chartersDone.length, requirements: last.requirements,
        festivalGoods: last.festivalGoods, sulkingPersonHours: last.sulkingPersonHours,
        hungryPersonHours: last.hungryPersonHours,
      });
    }
  }
}
const comparisons = cases.flatMap(name => curves.map(curve => {
  const rows = windows.filter(w => w.case === name && w.curve === curve && w.hours === 168);
  assert.equal(rows.length, 3, 'every arm must supply the seven-day commitment');
  const get = policy => rows.find(r => r.policy === policy);
  const c = get('comfort'), p = get('production'), s = get('save');
  return { case: name, curve, hours: 168,
    comfortVsProduction: { meanMood: c.meanMood - p.meanMood, comfort: c.meanComfort - p.meanComfort,
      passiveGrowthAvoided: p.passiveGrowth - c.passiveGrowth, daytimeSulkingAvoided: p.daytimeSulking - c.daytimeSulking,
      foodMade: c.foodMade - p.foodMade, endStrain: c.endStrain - p.endStrain },
    comfortVsSave: { meanMood: c.meanMood - s.meanMood, comfort: c.meanComfort - s.meanComfort,
      passiveGrowthAvoided: s.passiveGrowth - c.passiveGrowth, daytimeSulkingAvoided: s.daytimeSulking - c.daytimeSulking,
      foodMade: c.foodMade - s.foodMade, endStrain: c.endStrain - s.endStrain },
  };
}));
const report = { sourceBaseCommit: 'e802777b21d5c125dee44913de4aca30dfada501', commitmentHours: 168, horizonHours: 336,
  method: 'Four selected affordable checkpoints. Current/gentler/no-growth each compare a comfort building, an extra stew kitchen with one reserved worker, and saving the project budget. No other new buildings or paths for seven days; existing sites continue. Worker stays in general labor outside the production assignment. Normal bot construction/staffing resumes after seven days. Normal events/recruitment/relief continue throughout.',
  checkpoints, comparisons, windows, results };
writeFileSync('docs/comfort-investment-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ comparisons, durations: cases.map(name => ({ case: name, minHours: Math.min(...results.filter(r => r.case === name).map(r => r.observedHours)) })) }, null, 2));
