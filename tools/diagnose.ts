// Bot diagnostics: plays seeded runs, checks the colony every in-game hour for known problems,
// and reports how often each one happens, overall and per charter.
// Usage:
//   npx tsx tools/diagnose.ts [runs=100] [difficulty=normal]     aggregate report
//   npx tsx tools/diagnose.ts trace <seedIndex> [days=20]         day-by-day status of one run
import {
  createWorld, tick, day, hourOfDay, alive, TICKS_PER_HOUR, World, Difficulty, built, sites, workersAt, laborers,
  mealTotal, charterProgress, avgMood, bdef, lost,
} from '../src/sim/world';
import { RAW_FOODS } from '../src/sim/content';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';

import { ISSUES } from './issues';

function play(w: World, hourHook?: (w: World) => void) {
  while (w.status === 'playing' && day(w) <= 50) {
    autoDecide(w);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); autoDecide(w); }
    autoBuild(w);
    hourHook?.(w);
  }
}

function aggregate(runs: number, difficulty: Difficulty) {
  const hours: Record<string, number> = {}; let total = 0;
  const byCharter: Record<string, { hours: number; issues: Record<string, number> }> = {};
  let won = 0;
  const unstaffed: Record<string, [number, number]> = {};
  for (let i = 0; i < runs; i++) {
    const w = createWorld(1000 + i * 7919, difficulty);
    play(w, w2 => {
      if (hourOfDay(w2) < 6 || hourOfDay(w2) >= 22) return;
      total++;
      const ch = w2.charter ?? 'none';
      const bc = (byCharter[ch] ??= { hours: 0, issues: {} }); bc.hours++;
      for (const [name, test] of Object.entries(ISSUES)) if (test(w2)) { hours[name] = (hours[name] ?? 0) + 1; bc.issues[name] = (bc.issues[name] ?? 0) + 1; }
      for (const b of built(w2)) if (bdef(b).slots > 0) { const u = (unstaffed[b.def] ??= [0, 0]); u[1]++; if (workersAt(w2, b.uid).length === 0) u[0]++; }
    });
    if (w.status === 'won') won++;
  }
  console.log(`${runs} runs on ${difficulty}, won ${Math.round(won / runs * 100)}%. Share of waking hours each problem was present:`);
  for (const [k, v] of Object.entries(hours).sort((a, b) => b[1] - a[1])) console.log(`  ${String(Math.round(v / total * 100)).padStart(3)}%  ${k}`);
  console.log('Buildings most often completely unstaffed (share of hours they existed):');
  for (const [k, v] of Object.entries(unstaffed).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]).slice(0, 8)) console.log(`  ${String(Math.round(v[0] / v[1] * 100)).padStart(3)}%  ${k}`);
  console.log('Top problems while working on each charter:');
  for (const [ch, bc] of Object.entries(byCharter).sort((a, b) => b[1].hours - a[1].hours)) {
    const top = Object.entries(bc.issues).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v / bc.hours * 100)}%`).join(', ');
    console.log(`  ${ch.padEnd(10)} ${String(Math.round(bc.hours / 16)).padStart(4)} days total · ${top}`);
  }
}

function trace(index: number, days: number) {
  const w = createWorld(1000 + index * 7919, 'normal');
  let lastDay = 0;
  const seen: Record<string, number> = {};
  play(w, w2 => {
    if (hourOfDay(w2) >= 6 && hourOfDay(w2) < 22) for (const [name, test] of Object.entries(ISSUES)) if (test(w2)) seen[name] = (seen[name] ?? 0) + 1;
    if (Math.round(hourOfDay(w2)) === 21 && day(w2) !== lastDay && day(w2) <= days) {
      lastDay = day(w2);
      const p = charterProgress(w2);
      const issues = Object.entries(seen).filter(([, n]) => n >= 3).map(([k, n]) => `${k} (${n}h)`).join('; ') || 'none';
      console.log(`Day ${day(w2)}: ${p ? `${p.charter.name}: ${p.label}` : 'no charter'} | pop ${alive(w2).length}, lost ${lost(w2)}, mood ${Math.round(avgMood(w2))}, strain ${Math.round(w2.strain)}`);
      console.log(`  stock: wood ${Math.round(w2.res.wood)}, planks ${Math.round(w2.res.planks)}, raw ${Math.round(RAW_FOODS.reduce((n, r) => n + w2.res[r], 0))}, meals ${Math.round(mealTotal(w2))}, ale ${Math.round(w2.res.ale)} | laborers ${laborers(w2).length} | building: ${sites(w2).map(b => b.def).join(', ') || 'nothing'}`);
      console.log(`  problems today: ${issues}`);
      for (const k of Object.keys(seen)) delete seen[k];
    }
  });
  console.log(`Result: ${w.status} on day ${day(w)} with ${w.chartersDone.length} charters (${w.chartersDone.join(', ')})`);
}

if (process.argv[2] === 'trace') trace(Number(process.argv[3] ?? 0), Number(process.argv[4] ?? 20));
else aggregate(Number(process.argv[2] ?? 100), (process.argv[3] ?? 'normal') as Difficulty);
