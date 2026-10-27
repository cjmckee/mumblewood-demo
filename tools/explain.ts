// Why the bot does what it does, for one run: every choice with each option's score broken into parts, the morning
// staffing plan (who went where, in what order, and what didn't get anyone), and each building placed or skipped.
// Usage: npx tsx tools/explain.ts [seed=1000] [fromDay=1] [toDay=20] [kinds=decision,staff,build]
//   e.g. npx tsx tools/explain.ts 1000 1 10 decision      only the choices, days 1-10
import { createWorld, tick, day, alive, avgMood, TICKS_PER_HOUR, World, charterProgress, charterDef } from '../src/sim/world';
import { autoDecide, autoBuild, TRACE, BotNote } from '../src/sim/autoplayer';
import { BUILDING_BY_ID, RESEARCH_BY_ID, PERK_BY_ID } from '../src/sim/content';

const seed = Number(process.argv[2] ?? 1000);
const from = Number(process.argv[3] ?? 1), to = Number(process.argv[4] ?? 20);
const kinds = (process.argv[5] ?? 'decision,staff,build').split(',');
TRACE.on = true;

const w: World = createWorld(seed);
let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
const name = (id: string) => charterDef(id)?.name ?? BUILDING_BY_ID[id]?.name ?? RESEARCH_BY_ID[id]?.name ?? PERK_BY_ID[id]?.name ?? id;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const show = (n: BotNote) => {
  if (n.day < from || n.day > to || !kinds.includes(n.kind)) return;
  const head = `Day ${n.day} ${String(n.hour).padStart(2, '0')}:00 · ${n.title}${n.better ? ` (${n.better} score wins)` : ''}`;
  console.log(head);
  if (n.options) {
    const width = Math.max(...n.options.map(o => name(o.id).length));
    for (const o of n.options) {
      const parts = Object.entries(o.parts).filter(([, v]) => v !== 0).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${fmt(v)}`).join(' · ') || 'no adjustments';
      console.log(`  ${name(o.id) === name(n.chosen ?? '') || o.id === n.chosen ? '→' : ' '} ${name(o.id).padEnd(width)}  ${fmt(o.score).padStart(7)}   ${parts}`);
    }
  }
  if (n.chosen && !n.options?.some(o => o.id === n.chosen)) console.log(`  → ${name(n.chosen)}`);
  for (const l of n.lines ?? []) console.log(`    ${l}`);
};

let shown = 0;
while (w.status === 'playing' && day(w) <= to) {
  autoDecide(w, 'greedy', rand);
  for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
  autoBuild(w);
  if (Math.round(w.hour) % 24 === 6 && day(w) >= from && day(w) <= to) {
    const p = charterProgress(w);
    console.log(`\n=== Day ${day(w)} · ${alive(w).length} settlers · mood ${Math.round(avgMood(w))} · strain ${Math.round(w.strain)} · wood ${Math.floor(w.res.wood)} · ${p ? `${p.charter.name}: ${p.label}` : 'no charter yet'}`);
  }
  for (; shown < TRACE.notes.length; shown++) show(TRACE.notes[shown]);
}
console.log(`\n${w.status} on day ${day(w)}`);
