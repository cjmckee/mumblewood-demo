// Compact, reproducible export. Raw hourly traces and world snapshots stay in dist/.
import { readFileSync, writeFileSync } from 'node:fs';
const root = 'dist/comfort-recovery';
const read = path => JSON.parse(readFileSync(`${root}/${path}`, 'utf8'));
const windows = [];
for (const scenario of ['food', 'housing', 'service']) for (const curve of ['current', 'gentler']) for (const arm of ['control', 'shock']) {
  const { trace } = read(`controlled/${scenario}-${curve}-${arm}.json`);
  const end = trace.find(t => t.at >= 48 - 1e-5);
  windows.push({ scenario, curve, shock: arm === 'shock', hours: 48,
    strainChange: end.strain - trace[0].strain,
    minimumMood: Math.min(...trace.filter(t => t.at <= 48 + 1e-5).map(t => t.lowestMood)),
    sulkerPersonHours: end.sulkerPersonHours });
}
const delay = ['current', 'gentler'].map(curve => {
  const { summary } = read(`delay/${curve}.json`);
  return { curve, charter: summary.charter, forkHour: summary.forkHour,
    completionHour: summary.completion.hour, firstMet: summary.firstMet, blockedHours: summary.blockers };
});
const report = { sourceBaseCommit: '908c10ea5f219a6c9dd04c1f117be1fb99df16ea',
  method: 'Three selected situations from two seeds. Each has two curves and shock/control arms for 14 days, repeated with ordinary events and with future storyteller events deferred and routine recruits declined. These are 24 continuations, not independent samples. Festivals remain active. All service arms defer the founders feast.',
  controlled: read('controlled/summary.json'), eventOn: read('summary.json'), first48Hours: windows,
  delay, logisticsCounterfactual: read('delay/repair-summary.json') };
writeFileSync('docs/comfort-recovery-results.json', JSON.stringify(report, null, 2) + '\n');
console.log('docs/comfort-recovery-results.json');
