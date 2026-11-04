import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const profiles = ['off', 'balanced', 'steady', 'abundance', 'resilience'];
const cases = ['24757-cottage', '42-cottage', '1000-stage', '303-stage'];
const results = [], windows = [];
for (const profile of profiles) for (const name of cases) for (const policy of ['comfort', 'production', 'save']) {
  const { summary, trace } = JSON.parse(readFileSync(`dist/comfort-milestones/${profile}/${name}-current-${policy}.json`, 'utf8'));
  assert.equal(summary.observedHours, 336);
  assert.equal(summary.milestoneProfile, profile);
  assert(Math.abs(summary.levelHours.reduce((n, x) => n + x, 0) - 336) < 1e-6);
  results.push(summary);
  for (const hours of [168, 336]) {
    const rows = trace.filter(r => r.at > 0 && r.at <= hours), last = rows.at(-1);
    assert.equal(rows.length, hours);
    windows.push({ profile, case: name, policy, hours, levelHours: last.levelHours,
      meanMood: rows.reduce((n, r) => n + r.mood, 0) / hours,
      passiveGrowth: last.passiveGrowth, endStrain: last.strain, daytimeSulking: last.daytimeSulking,
      foodMade: last.foodMade, endFood: last.food, endFine: last.fine, population: last.population,
      addedCharters: last.chartersDone.length - trace[0].chartersDone.length,
      bonusUnits: last.bonusUnits, bonusBatches: last.bonusBatches });
  }
}
const old = JSON.parse(readFileSync('docs/comfort-investment-results.json', 'utf8'));
for (const s of results.filter(r => r.milestoneProfile === 'off')) {
  const previous = old.results.find(r => r.case === s.case && r.curve === 'current' && r.policy === s.policy);
  assert.equal(s.checkpointHash, previous.checkpointHash);
  for (const key of ['foodMade', 'meanMood', 'endStrain', 'daytimeSulking', 'addedCharters']) assert(Math.abs(s[key] - previous[key]) < 1e-8, `default regression ${s.case}/${s.policy}/${key}`);
}
const aggregate = profiles.map(profile => {
  const rows = results.filter(r => r.milestoneProfile === profile);
  return { profile, continuations: rows.length, levelHours: [0, 1, 2, 3].map(level => rows.reduce((n, r) => n + r.levelHours[level], 0)),
    foodMade: rows.reduce((n, r) => n + r.foodMade, 0), daytimeSulking: rows.reduce((n, r) => n + r.daytimeSulking, 0),
    eligibleBatches: rows.reduce((n, r) => n + r.eligibleBatches, 0), bonusBatches: rows.reduce((n, r) => n + r.bonusBatches, 0), bonusUnits: rows.reduce((n, r) => n + r.bonusUnits, 0),
    passiveGrowth: rows.reduce((n, r) => n + r.passiveGrowth, 0), addedCharters: rows.reduce((n, r) => n + r.addedCharters, 0), losses: rows.reduce((n, r) => n + r.departures + r.deaths, 0) };
});
const choices = profiles.flatMap(profile => cases.map(name => {
  const get = policy => windows.find(r => r.profile === profile && r.case === name && r.policy === policy && r.hours === 168);
  const c = get('comfort'), p = get('production');
  return { profile, case: name, comfortMinusProduction: { meanMood: c.meanMood - p.meanMood, foodMade: c.foodMade - p.foodMade, passiveGrowthAvoided: p.passiveGrowth - c.passiveGrowth, daytimeSulkingAvoided: p.daytimeSulking - c.daytimeSulking, level2plusHours: c.levelHours[2] + c.levelHours[3] - p.levelHours[2] - p.levelHours[3] } };
}));
const thresholds = JSON.parse(readFileSync('dist/comfort-milestones/balanced/requirements.json', 'utf8'));
for (const profile of profiles.filter(p => p !== 'off')) assert.deepEqual(JSON.parse(readFileSync(`dist/comfort-milestones/${profile}/requirements.json`, 'utf8')), thresholds);
const initialGating = existsSync('docs/comfort-milestones-initial-gating.json') ? JSON.parse(readFileSync('docs/comfort-milestones-initial-gating.json', 'utf8')) : null;
const report = { sourceBaseCommit: 'aaada43', method: 'Four matched affordable checkpoints, three investment policies, five reward settings, 24-hour empty-history warmup, normal current curve underneath. Seven-day one-project commitment then seven-day follow-up. Related diagnostic continuations, not independent samples. All settings share a separate initial bonus RNG seed within each checkpoint.', thresholds, initialGating, aggregate, choices, windows, results };
writeFileSync('docs/comfort-milestones-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ aggregate, choices }, null, 2));
