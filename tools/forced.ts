// Charter health check: every run is made to take one specific charter when its tier comes up.
// Reports how often it's finished, how long it takes, and the most common problems while on it.
// Usage: npx tsx tools/forced.ts [runsPerCharter=40] [onlyCharterId]
import { createWorld, tick, day, hourOfDay, TICKS_PER_HOUR } from '../src/sim/world';
import { CHARTERS } from '../src/sim/content';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { ISSUES } from './issues';

const runs = Number(process.argv[2] ?? 40);
const only = process.argv[3];
const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
console.log('charter       tier  reached  finished  median days  top problems while on it');
for (const ch of CHARTERS.filter(c => !only || c.id === only)) {
  const days: number[] = []; let reached = 0, done = 0, hours = 0;
  const issues: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const w = createWorld(5000 + i * 7919, 'normal');
    let since = -1;
    while (w.status === 'playing' && day(w) <= 50) {
      const force = () => { for (const d of w.decisions) if (d.kind === 'charter' && d.tier === ch.tier) d.options = [ch.id]; };
      force(); autoDecide(w);
      for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); force(); autoDecide(w); }
      autoBuild(w);
      if (w.charter === ch.id) {
        if (since < 0) { since = w.hour; reached++; }
        if (hourOfDay(w) >= 6 && hourOfDay(w) < 22) { hours++; for (const [k, f] of Object.entries(ISSUES)) if (f(w)) issues[k] = (issues[k] ?? 0) + 1; }
      }
      if (since >= 0 && w.charter !== ch.id) break;
    }
    if (w.chartersDone.includes(ch.id)) { done++; days.push((w.hour - since) / 24); }
  }
  const top = Object.entries(issues).filter(([k]) => k !== 'more workplaces than workers').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v / Math.max(1, hours) * 100)}%`).join('; ');
  console.log(`${ch.id.padEnd(13)} ${ch.tier}    ${String(reached).padStart(5)}  ${String(reached ? Math.round(done / reached * 100) + '%' : '-').padStart(7)}  ${med(days).toFixed(1).padStart(10)}   ${top}`);
}
