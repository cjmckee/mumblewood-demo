export const armLabels = { current: 'Current', gentler: 'Gentler', 'no-growth': 'Growth off', 'zero-strain': 'Strain zero' };
export function renderStrainAblation(report) {
  const fmt = n => n.toFixed(1);
  const signed = n => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
  const headlineRows = report.aggregate.map(r => `<tr><th>${armLabels[r.arm]}</th><td>${r.wins}/${r.cases}</td><td>${signed(r.medianPairedCommonWindowMoodGain)}</td><td>${fmt(r.commonWindowDaytimeSulkingPersonHours)}</td></tr>`).join('');
  const details = report.checkpoints.map(c => {
    const windows = report.commonWindows.filter(r => r.seed === c.seed);
    const runs = report.results.filter(r => r.seed === c.seed);
    return `<details data-ablation-seed="${c.seed}"><summary>Seed ${c.seed} · ${fmt(windows[0].observedHours / 24)} matched days</summary><div class="scroll"><table><thead><tr><th>Arm</th><th>Mean mood</th><th>Daytime sulking hours</th><th>Festival goods</th><th>Full-run outcome / day</th></tr></thead><tbody>${windows.map(w => {
      const r = runs.find(r => r.arm === w.arm);
      return `<tr><th>${armLabels[w.arm]}</th><td>${fmt(w.meanMood)}</td><td>${fmt(w.daytimeSulkingPersonHours)}</td><td>${w.festivalGoods}</td><td>${r.status === 'won' ? 'Won' : r.status === 'cutoff' ? 'Cutoff' : 'Collapsed'} / ${fmt(r.elapsedDays)}</td></tr>`;
    }).join('')}</tbody></table></div><p class="note">Starts at elapsed day ${fmt((c.hour - 6) / 24)} with ${fmt(c.strain)} strain. Mood, sulking and festival goods cover the matched window; outcome covers the full continuation. Shared checkpoint ${c.hash.slice(0, 12)}.</p></details>`;
  }).join('');
  return `<section class="card" id="strain-test"><p class="eyebrow">Latest test · strain ablation</p><h2>Does strain change the game?</h2>
<p>Eight seeds were selected before running this comparison. The same bot policy plays each to its first completed charter, then each checkpoint is cloned into four continuations.</p>
<p><strong>Current</strong> and <strong>Gentler</strong> use normal growth. <strong>Growth off</strong> stops passive growth but keeps inherited strain, event additions and relief. <strong>Strain zero</strong> holds strain at zero throughout; inherited mood and history remain. Both disabled arms are diagnostic tools.</p>
<div class="scroll"><table><caption>${report.checkpoints.length} matched seed cases · ${report.results.length} continuations</caption><thead><tr><th>Arm</th><th>Wins by day ${report.limit}</th><th>Median mood gain</th><th>Daytime sulking hours</th></tr></thead><tbody>${headlineRows}</tbody></table></div>
<p class="note">Mood gain is each seed’s change from current, then the median across seeds. Mood and summed daytime sulking use matching windows: up to 30 days after the checkpoint, shortened for all arms of a seed if any arm ends sooner. Daytime sulking is time spent refusing work, not a measured quantity of lost output. Wins use the longer full-run horizon.</p>
<p class="callout">Strain has a measurable cost that this bot usually manages. Current and growth-off both won all eight cases. Removing growth reduced interruptions and festival spending, but did not consistently produce faster wins.</p>
<p>The current daytime sulking burden averaged about 31 person-hours per colony over 30 days; 83% came from the original two seeds. The gentler curve remains a test candidate, not an established balance improvement.</p>
<p>Events, recruitment, festivals and staffing remain responsive to the world. Disabling strain changes those responses too, so this measures the system’s effect with an adaptive bot. It does not isolate only the mood penalty, test human decisions or establish an ideal curve.</p>
${details}<p class="note">${report.exclusions.length} selected seeds were excluded for failing to reach a surviving first-charter checkpoint. Four arms per seed are related continuations, not independent samples. The normal game still uses its original balance.</p></section>`;
}
