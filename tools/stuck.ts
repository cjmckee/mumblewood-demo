// Where runs get stuck. For each charter: how often it's taken, how often it's finished and how long that takes, and
// which of its conditions was the last one still unmet (the one actually holding it up), hour by hour. Then what the
// runs that didn't win were working on when they ended.
// Usage: npx tsx tools/stuck.ts [runs=60] [days=90]
import { createWorld, tick, day, alive, TICKS_PER_HOUR, World, charterParts, avgMood } from '../src/sim/world';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
// BOT='{"varietyRules":false}' switches bot behaviours for an A/B
if (process.env.BOT) Object.assign(BOT, JSON.parse(process.env.BOT));
import { charterDef } from '../src/sim/world';

const N = Number(process.argv[2] ?? 60), DAYS = Number(process.argv[3] ?? 90);
interface Stat { taken: number; done: number; hours: number[]; blockedBy: Record<string, number>; hoursOn: number }
const stats: Record<string, Stat> = {};
const endings: Record<string, Record<string, number>> = {};
const endBlock: Record<string, Record<string, number>> = {};
const kindOf = (k: string, label: string) => (k === 'stock' || k === 'variety' ? `${k}: ${label.replace(/[\d.]+ \/ /, '').replace(/^\d+ \/ /, '')}` : k);
for (let i = 0; i < N; i++) {
  const w: World = createWorld(1000 + i * 7919);
  let r = 1000 + i; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  let cur: string | null = null, since = 0;
  while (w.status === 'playing' && day(w) <= DAYS) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
    if (w.charter !== cur) {
      if (cur && w.chartersDone.includes(cur)) { stats[cur].done++; stats[cur].hours.push(w.hour - since); }
      cur = w.charter ?? null; since = w.hour;
      if (cur) (stats[cur] ??= { taken: 0, done: 0, hours: [], blockedBy: {}, hoursOn: 0 }).taken++;
    }
    if (cur) {
      const s = stats[cur]; s.hoursOn++;
      const unmet = charterParts(w).filter(p => !p.met);
      // what's holding it up: if only one condition is unmet, that one; otherwise mark the combination
      const key = unmet.length === 1 ? kindOf(unmet[0].kind, unmet[0].label) : unmet.length ? `${unmet.length} unmet: ${unmet.map(p => p.kind).join('+')}` : 'met (finishing)';
      s.blockedBy[key] = (s.blockedBy[key] ?? 0) + 1;
    }
  }
  if (cur && w.chartersDone.includes(cur)) { stats[cur].done++; stats[cur].hours.push(w.hour - since); }
  const outcome = w.status === 'won' ? 'won' : w.status === 'lost' ? 'collapsed' : 'ran out of time';
  const on = w.status === 'won' ? '-' : cur ? `${w.chartersDone.length + 1}: ${charterDef(cur)?.name}` : `${w.chartersDone.length + 1}: none picked`;
  (endings[outcome] ??= {})[on] = ((endings[outcome] ??= {})[on] ?? 0) + 1;
  if (w.status !== 'won' && cur) for (const p of charterParts(w).filter(p => !p.met)) { const k = `${charterDef(cur)?.name}: ${kindOf(p.kind, p.label)}`; (endBlock[outcome] ??= {})[k] = ((endBlock[outcome] ??= {})[k] ?? 0) + 1; }
  void alive; void avgMood;
}
const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] / 24 : NaN);
console.log(`${N} runs, ${DAYS} days\n\nCHARTERS: taken → finished, median days to finish; share of hours on it blocked by each condition`);
for (const [id, s] of Object.entries(stats).sort((a, b) => b[1].taken - a[1].taken)) {
  console.log(`  ${(charterDef(id)?.name ?? id).padEnd(20)} ${String(s.taken).padStart(3)} → ${String(s.done).padStart(3)}  ${isNaN(med(s.hours)) ? '   –' : med(s.hours).toFixed(1).padStart(5)}d`);
  for (const [k, h] of Object.entries(s.blockedBy).sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`      ${(Math.round((h / s.hoursOn) * 100) + '%').padStart(4)}  ${k}`);
}
console.log('\nENDINGS: outcome → charter being worked on');
for (const [o, m] of Object.entries(endings)) { console.log(`  ${o}`); for (const [k, n] of Object.entries(m).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)}  ${k}`); }
console.log('\nUNMET AT THE END (runs that didn’t win)');
for (const [o, m] of Object.entries(endBlock)) { console.log(`  ${o}`); for (const [k, n] of Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(n).padStart(3)}  ${k}`); }
