// Where the bot's wood comes from and goes, and how well its woodcutters work.
// Usage: npx tsx tools/wood.ts [runs=20] [seedBase=31000]
import { createWorld, tick, day, TICKS_PER_HOUR, alive, built, workersAt, World } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';

const runs = Number(process.argv[2] ?? 20);
const base = Number(process.argv[3] ?? 31000);
const phases: [number, number][] = [[1, 4], [5, 9], [10, 15], [16, 30]];
const tot = phases.map(() => ({ flows: {} as Record<string, number>, days: 0, cutters: 0, slots: 0, workers: 0, eff: 0, effN: 0, working: 0, assigned: 0, wood: 0, pop: 0, hours: 0 }));
const snap = (w: World) => ({ ...w.flows });
for (let i = 0; i < runs; i++) {
  const w = createWorld(base + i * 7919, 'normal');
  let start = snap(w), phaseIdx = 0;
  const close = (p: number) => { const t = tot[p]; for (const [k, v] of Object.entries(w.flows)) if (k.startsWith('wood') || k.startsWith('planks')) t.flows[k] = (t.flows[k] ?? 0) + v - (start[k] ?? 0); start = snap(w); };
  while (w.status === 'playing' && day(w) <= 30) {
    autoDecide(w); for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); autoDecide(w); } autoBuild(w);
    const p = phases.findIndex(([lo, hi]) => day(w) >= lo && day(w) <= hi);
    if (p !== phaseIdx && p >= 0) { close(phaseIdx); phaseIdx = p; }
    if (p < 0) continue;
    const t = tot[p]; t.hours++;
    const cs = built(w).filter(b => b.def === 'woodcutter');
    t.cutters += cs.length; t.slots += cs.reduce((n, b) => n + 2 * 0 + (b ? 1 : 0), 0);
    for (const b of cs) { t.eff += b.eff; t.effN++; const ws = workersAt(w, b.uid); t.assigned += ws.length; t.working += ws.filter(c => c.activity === 'working' && c.goalReached).length; }
    t.wood += w.res.wood; t.pop += alive(w).length;
  }
  close(phaseIdx);
}
for (let p = 0; p < phases.length; p++) {
  const t = tot[p]; if (!t.hours) continue;
  const days = t.hours / 24;
  console.log(`\nDays ${phases[p][0]}-${phases[p][1]} (per colony-day): pop ${(t.pop / t.hours).toFixed(1)}, wood on hand ${(t.wood / t.hours).toFixed(0)}, woodcutter huts ${(t.cutters / t.hours).toFixed(1)} (avg efficiency ${(t.eff / Math.max(1, t.effN) * 100).toFixed(0)}%), assigned ${(t.assigned / t.hours).toFixed(1)}, actually chopping ${(t.working / Math.max(1, t.assigned) * 100).toFixed(0)}% of assigned hours`);
  for (const [k, v] of Object.entries(t.flows).sort((a, b) => b[1] - a[1])) if (Math.abs(v / days) >= 0.3) console.log(`  ${(v / days >= 0 ? '' : '')}${(v / days).toFixed(1).padStart(7)}  ${k}`);
}
