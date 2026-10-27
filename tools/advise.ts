// What a player would conclude from the screen at a few moments in a bot game.
// Usage: npx tsx tools/advise.ts [runs=2] [seedBase=31000] [days=4,8,12,16,20]
import { createWorld, tick, day, hourOfDay, TICKS_PER_HOUR, alive, avgMood, charterProgress } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { assess, gripeSummary } from '../src/sim/advisor';

const runs = Number(process.argv[2] ?? 2);
const base = Number(process.argv[3] ?? 31000);
const days = (process.argv[4] ?? '4,8,12,16,20').split(',').map(Number);
for (let i = 0; i < runs; i++) {
  const w = createWorld(base + i * 7919);
  console.log(`\n=== run ${i} (seed ${base + i * 7919})`);
  while (w.status === 'playing' && day(w) <= Math.max(...days)) {
    autoDecide(w); for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); autoDecide(w); } autoBuild(w);
    if (Math.round(hourOfDay(w)) === 12 && days.includes(day(w))) {
      const cp = charterProgress(w);
      console.log(`\n-- day ${day(w)} noon: pop ${alive(w).length}, mood ${Math.round(avgMood(w))}, strain ${w.strain.toFixed(0)}, wood ${w.res.wood | 0}, planks ${w.res.planks | 0}, charter ${w.charter ?? '-'} ${cp ? `(${cp.label})` : ''}`);
      console.log('   gripes: ' + gripeSummary(w).map(g => `${g.key}×${g.people} (−${g.weight.toFixed(0)})`).join(', '));
      for (const c of assess(w).slice(0, 6)) console.log(`   [${c.weight.toFixed(0).padStart(3)}] ${c.title} — ${c.evidence}\n         → ${c.idea}`);
    }
  }
}
