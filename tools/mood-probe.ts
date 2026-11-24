import { createWorld, tick, day, alive, TICKS_PER_HOUR } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
const seed = Number(process.argv[2] ?? 1000), until = Number(process.argv[3] ?? 30);
const w = createWorld(seed); let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
while (day(w) < until) { autoDecide(w, 'greedy', rand); for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); } autoBuild(w); }
const agg: Record<string, number> = {};
for (const c of alive(w)) for (const t of c.thoughts as { label: string; value: number }[]) agg[t.label] = (agg[t.label] ?? 0) + t.value / alive(w).length;
console.log(`day ${day(w)} pop ${alive(w).length} mood ${(alive(w).reduce((s, c) => s + c.mood, 0) / alive(w).length).toFixed(0)}`);
console.log(Object.entries(agg).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${v.toFixed(1)} ${k}`).join('\n'));
