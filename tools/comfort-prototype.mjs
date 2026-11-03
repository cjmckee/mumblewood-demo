import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const result = await build({ entryPoints: ['tools/comfort-preview-entry.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const labels = { current: 'Current', strong: 'Proposed', reward: 'Gentler' };
const savedReport = JSON.parse(readFileSync('docs/comfort-curve-results.json', 'utf8'));
let tables = '';
for (const seed of [1000, 24757]) {
  const report = savedReport.cases.find(c => c.seed === seed);
  if (!report) continue;
  tables += `<details><summary>Seed ${seed} · starts on day ${report.results[0].forkDay}</summary><div class="scroll"><table><thead><tr><th>Curve</th><th>Staffing</th><th>Outcome</th><th>Elapsed days</th><th>Lowest mood</th><th>Lost</th></tr></thead><tbody>${report.results.map(r => `<tr><th>${labels[r.curve]}</th><td>${r.staffing === 'standard' ? 'Standard' : 'Comfort earlier'}</td><td>${r.status === 'won' ? 'Won' : r.status === 'lost' ? 'Lost' : 'Cutoff'}</td><td>${r.elapsedDays.toFixed(1)}</td><td>${r.minimumMood.toFixed(1)}</td><td>${r.departures + r.deaths}</td></tr>`).join('')}</tbody></table></div><p class="note">All rows share checkpoint ${report.checkpointHash.slice(0, 12)}. Observation limit: ${report.limit} elapsed days from the start of the colony.</p></details>`;
}
const html = readFileSync('tools/comfort-preview.html', 'utf8').replace('/*BUNDLE*/', () => script).replace('<!--RESULTS-->', tables || '<p>Run the diagnostic probe to add comparison results.</p>');
mkdirSync('dist/comfort-prototype', { recursive: true });
writeFileSync('dist/comfort-prototype/index.html', html);
console.log('dist/comfort-prototype/index.html');
