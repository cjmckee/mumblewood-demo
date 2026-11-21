// The work grid without the bot: everyone on their default grid, decisions take the first option, nothing built by hand.
// Prints where the working day goes, so idle time and missing hauling show up. npx tsx tools/work-grid-check.ts [seed] [days]
import { createWorld, tick, apply, alive, day, hourOfDay, TICKS_PER_HOUR, prioOf, tradeOf } from '../src/sim/world';
const seed = +(process.argv[2] ?? 1000), days = +(process.argv[3] ?? 4);
const w = createWorld(seed);
const time: Record<string, number> = {};
for (let h = 0; h < days * 24; h++) {
  while (w.decisions.length) { const before = w.decisions.length; apply(w, { type: 'resolve', option: 0 } as never); if (w.decisions.length >= before) w.decisions.shift(); }
  for (const c of alive(w)) if (c.settling) apply(w, { type: 'settle', colonist: c.id });
  for (let t = 0; t < TICKS_PER_HOUR; t++) tick(w);
  const hod = hourOfDay(w);
  if (hod >= 7 && hod < 18) for (const c of alive(w)) {
    const k = c.job != null ? 'workshop' : c.task ? c.task.kind : c.activity;
    time[k] = (time[k] ?? 0) + 1;
  }
}
const tot = Object.values(time).reduce((a, b) => a + b, 0);
console.log(`seed ${seed}, ${days} days, ${alive(w).length} settlers`);
for (const [k, v] of Object.entries(time).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${(v / tot * 100).toFixed(0)}%`);
console.log('  stock', Object.entries(w.res).filter(([, v]) => v >= 1).map(([k, v]) => `${k} ${Math.floor(v)}`).join(', '));
console.log('  shelves', w.buildings.filter(b => Object.values(b.outbox).some(v => v >= 1)).map(b => `${b.def} ${JSON.stringify(b.outbox)}`).join(' | '));
for (const c of alive(w)) console.log(`  ${c.name.padEnd(22)} top ${tradeOf(w, c)} build ${prioOf(w, c, 'building')}`);
