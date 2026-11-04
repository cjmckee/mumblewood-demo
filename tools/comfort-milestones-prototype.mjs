import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const result = await build({ entryPoints: ['tools/comfort-milestones-entry.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const cases = readFileSync('docs/comfort-milestone-checkpoints.json', 'utf8').replace(/</g, '\\u003c');
let results = '';
try {
  const report = JSON.parse(readFileSync('docs/comfort-milestones-results.json', 'utf8'));
  results = `<section class="card" id="results"><h2>Matched investment tests</h2><p>Four checkpoints × three choices × five reward settings: 60 related continuations, observed for 14 days. These are selected cases, not independent samples or human playtests.</p><div class="scroll"><table><thead><tr><th>Set</th><th>Hours at level 3</th><th>Meals made</th><th>Daytime sulking hours</th><th>Bonus batches / eligible</th></tr></thead><tbody>${report.aggregate.map(r => `<tr><th>${r.profile}</th><td>${r.levelHours[3].toFixed(1)}</td><td>${r.foodMade}</td><td>${r.daytimeSulking.toFixed(1)}</td><td>${r.bonusBatches} / ${r.eligibleBatches}</td></tr>`).join('')}</tbody></table></div><p class="note">Totals sum twelve cases per setting. Bonus frequency depends on reaching an eligible level; a setting with little level-3 exposure has not been adequately tested there. Production and events can diverge. Nominal reward percentages do not predict whole-colony gains.</p></section>`;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = readFileSync('tools/comfort-milestones.html', 'utf8').replace('/*CASES*/', () => cases).replace('/*BUNDLE*/', () => script).replace('<!--RESULTS-->', () => results);
mkdirSync('dist/comfort-milestones-prototype', { recursive: true });
writeFileSync('dist/comfort-milestones-prototype/index.html', html);
console.log('dist/comfort-milestones-prototype/index.html');
