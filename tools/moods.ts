// Where mood comes from on a forced charter: average contribution of each kind of thought, plus romance stats.
// Usage: npx tsx tools/moods.ts <charterId> [runs=20]
import { createWorld, tick, day, hourOfDay, TICKS_PER_HOUR, alive, avgMood, opinion, couples } from '../src/sim/world';
import { CHARTERS } from '../src/sim/content';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';

const id = process.argv[2] ?? 'settled';
const runs = Number(process.argv[3] ?? 20);
const ch = CHARTERS.find(c => c.id === id)!;
const contrib: Record<string, number> = {};
let samples = 0, moodSum = 0, strainSum = 0, popSum = 0, bestMood: number[] = [], done = 0;
let pairs = 0, warmPairs = 0, singles = 0, coupleHours = 0, breakups = 0, formed = 0, eveningSolo = 0, eveningAll = 0;
const firstCouple: number[] = [];
const startDay: number[] = [], startMood: number[] = [], startStrain: number[] = [], swings: number[] = [];
const med = (xs: number[]) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN;
const norm = (l: string) => l.replace(/^(Fell for|Broke up with|Insulted by|Has to work with|In love with) .*/, '$1 …').replace(/^\S+ (won’t stop complaining|is a ray of sunshine)/, '… $1').replace(/^Loves .*/, 'Loves their job').replace(/^Hates .*/, 'Hates their job').replace(/^Sick: .*/, 'Sick').replace(/^Ate raw .*/, 'Ate raw food').replace(/ died$/, ' (death)');
for (let i = 0; i < runs; i++) {
  const w = createWorld(5000 + i * 7919);
  let since = -1, best = 0, b0 = 0, c0 = 0, gotCouple = false; let dayMoods: number[] = [];
  while (w.status === 'playing' && day(w) <= 90) {
    const force = () => { for (const d of w.decisions) if (d.kind === 'charter' && d.tier === ch.tier) d.options = [ch.id]; };
    force(); autoDecide(w);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); force(); autoDecide(w); }
    autoBuild(w);
    if (w.charter === ch.id) {
      if (since < 0) { since = w.hour; b0 = w.stats.breakups; c0 = w.stats.couples; startDay.push(day(w)); startMood.push(avgMood(w)); startStrain.push(w.strain); }
      if (hourOfDay(w) === 6) { if (dayMoods.length >= 20) swings.push(Math.max(...dayMoods) - Math.min(...dayMoods)); dayMoods = []; }
      dayMoods.push(avgMood(w));
      const a = alive(w);
      samples++; moodSum += avgMood(w); strainSum += w.strain; popSum += a.length; best = Math.max(best, avgMood(w));
      for (const c of a) for (const t of c.thoughts) contrib[norm(t.label)] = (contrib[norm(t.label)] ?? 0) + t.value / a.length;
      for (const x of a) for (const y of a) if (x.id < y.id) { pairs++; if (opinion(w, x.id, y.id) > 30 && opinion(w, y.id, x.id) > 30) warmPairs++; }
      singles += a.filter(c => c.partner == null).length; coupleHours += couples(w);
      if (hourOfDay(w) === 20) for (const c of a) { eveningAll++; if (!c.hadCompany) eveningSolo++; }
      if (!gotCouple && couples(w) >= 1) { gotCouple = true; firstCouple.push((w.hour - since) / 24); }
    }
    if (since >= 0 && w.charter !== ch.id) break;
  }
  if (since >= 0) { bestMood.push(best); breakups += w.stats.breakups - b0; formed += w.stats.couples - c0; }
  if (w.chartersDone.includes(ch.id)) done++;
}
const n = Math.max(1, samples);
console.log(`${ch.name}: finished ${done}/${bestMood.length} · avg mood ${(moodSum / n).toFixed(1)} · strain ${(strainSum / n).toFixed(1)} · pop ${(popSum / n).toFixed(1)} · best avg mood per run median ${bestMood.sort((a, b) => a - b)[Math.floor(bestMood.length / 2)]?.toFixed(1)}`);
console.log('Average mood contribution per colonist (sorted):');
for (const [k, v] of Object.entries(contrib).sort((a, b) => b[1] - a[1])) if (Math.abs(v / n) >= 0.15) console.log(`  ${(v / n >= 0 ? '+' : '') + (v / n).toFixed(2).padStart(6)}  ${k}`);
console.log(`Romance: mutual >30 pairs ${(warmPairs / Math.max(1, pairs) * 100).toFixed(1)}% of pairs · avg couples ${(coupleHours / n).toFixed(2)} · couples formed ${formed}, breakups ${breakups} over ${bestMood.length} runs · alone at 8pm ${(eveningSolo / Math.max(1, eveningAll) * 100).toFixed(0)}%`);
console.log(`Charter starts: median day ${med(startDay)}, mood ${med(startMood).toFixed(1)}, strain ${med(startStrain).toFixed(1)} · daily mood swing (max−min) median ${med(swings).toFixed(1)} · first couple after median ${med(firstCouple).toFixed(1)} days (${firstCouple.length} runs got one)`);
