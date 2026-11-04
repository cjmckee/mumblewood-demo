import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderStrainAblation } from './strain-ablation-preview.mjs';
import { renderComfortInvestment } from './comfort-investment-preview.mjs';
const result = await build({ entryPoints: ['tools/comfort-preview-entry.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const labels = { current: 'Current', strong: 'Proposed', reward: 'Gentler' };
const savedReport = JSON.parse(readFileSync('docs/comfort-curve-results.json', 'utf8'));
const ablationHtml = renderStrainAblation(JSON.parse(readFileSync('docs/strain-ablation-results.json', 'utf8')));
const investmentHtml = renderComfortInvestment(JSON.parse(readFileSync('docs/comfort-investment-results.json', 'utf8')));
const recovery = JSON.parse(readFileSync('docs/comfort-recovery-results.json', 'utf8'));
const situationNames = { food: 'Food loss', housing: 'An extra settler', service: 'Tavern paused' };
const rows = ['food', 'housing', 'service'].map(scenario => {
  const arms = recovery.controlled.results.filter(r => r.scenario === scenario && r.shock);
  const immediate = recovery.first48Hours.filter(r => r.scenario === scenario && r.shock);
  return `<tr><th>${situationNames[scenario]}</th><td>${arms.map(r => `${r.resourceRecoveryHours}h`).join(' / ')}</td><td>${immediate.map(r => r.minimumMood.toFixed(1)).join(' / ')}</td></tr>`;
}).join('');
const recoveryHtml = `<section class="card" id="recovery"><p class="eyebrow">Situational plays</p><h2>Comfort buys time. Supplies fix shortages.</h2>
<p>We removed stored food, welcomed a ninth settler into eight beds, and diverted tavern workers for two days. Each situation starts from a shared checkpoint and has a matching run without the disruption.</p>
<div class="scroll"><table><caption>Current / gentler · restricted-event runs</caption><thead><tr><th>Disruption</th><th>Recovery</th><th>Lowest mood, first 48h</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="note">Food recovery must last 12h; housing must last 24h. Tavern recovery is the first new regular drink stock charge with service staffed after the 48h pause. These are hourly operational milestones, not full mood recovery.</p>
<p>The gentler curve reduced the first two days’ strain growth by about 0.09 after food loss and 0.12 after the extra recruit. Neither repaired the shortage faster. Food and service disruptions still caused mood dips and sulking.</p>
<p class="callout">Keep testing the gentler curve using existing items. The reward is extra long-term headroom; urgent needs still need workers and supplies.</p>
<details id="recovery-controls"><summary>Compare each disruption with its control</summary><div class="scroll"><table><thead><tr><th>Situation</th><th>Curve</th><th>Arm</th><th>Lowest mood, 48h</th><th>Sulking person-hours, 48h</th></tr></thead><tbody>${recovery.first48Hours.map(r => `<tr><th>${situationNames[r.scenario]}</th><td>${r.curve === 'current' ? 'Current' : 'Gentler'}</td><td>${r.shock ? 'Disrupted' : 'Control'}</td><td>${r.minimumMood.toFixed(1)}</td><td>${r.sulkerPersonHours.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></details>
<p class="note">Three selected situations from two seeds, observed for 14 days. Twelve continuations with ordinary events, then twelve with new storyteller events deferred and routine recruits declined. Festivals remain active and change relief timing. The tavern was prepared through normal drafts, construction and labor; all its arms deferred the finale. No settler losses occurred, but these are not independent samples or a verdict on severe shortages.</p>
<h2>A separate meal-chain bottleneck</h2><p>The delayed charter needed refined meals even when its mood target was met. Two acorns sat in a basket while the mill needed one more to start a batch. A diagnostic haul using a real worker unlocked flour and brought charter completion forward by about seven days against a matched control.</p>
<p class="note">Both diagnostic arms paused bot planning for six hours, then resumed it. No goods were granted. This does not explain the whole original delay or establish a balance improvement. Small-batch hauling needs a separate investigation.</p>
<p>Next playtest: choose between restoring beds or food first, and between tavern service or essential production. These runs measure disruptions; they do not yet settle which recovery choice is best.</p></section>`;
let tables = '';
for (const seed of [1000, 24757]) {
  const report = savedReport.cases.find(c => c.seed === seed);
  if (!report) continue;
  tables += `<details><summary>Seed ${seed} · starts on day ${report.results[0].forkDay}</summary><div class="scroll"><table><thead><tr><th>Curve</th><th>Staffing</th><th>Outcome</th><th>Elapsed days</th><th>Lowest mood</th><th>Lost</th></tr></thead><tbody>${report.results.map(r => `<tr><th>${labels[r.curve]}</th><td>${r.staffing === 'standard' ? 'Standard' : 'Comfort earlier'}</td><td>${r.status === 'won' ? 'Won' : r.status === 'lost' ? 'Lost' : 'Cutoff'}</td><td>${r.elapsedDays.toFixed(1)}</td><td>${r.minimumMood.toFixed(1)}</td><td>${r.departures + r.deaths}</td></tr>`).join('')}</tbody></table></div><p class="note">All rows share checkpoint ${report.checkpointHash.slice(0, 12)}. Observation limit: ${report.limit} elapsed days from the start of the colony.</p></details>`;
}
const html = readFileSync('tools/comfort-preview.html', 'utf8').replace('/*BUNDLE*/', () => script).replace('<!--INVESTMENT-TEST-->', () => investmentHtml).replace('<!--STRAIN-TEST-->', () => ablationHtml).replace('<!--RECOVERY-->', () => recoveryHtml).replace('<!--RESULTS-->', tables || '<p>Run the diagnostic probe to add comparison results.</p>');
mkdirSync('dist/comfort-prototype', { recursive: true });
writeFileSync('dist/comfort-prototype/index.html', html);
console.log('dist/comfort-prototype/index.html');
