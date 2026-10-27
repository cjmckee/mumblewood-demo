// Read a handful of bot runs closely: what it chose, how mood is spread across pawns, why people leave,
// and whether mood follows the quality of the settlement.
// Usage: npx tsx tools/review.ts [runs=8] [seedBase=777] [depot=none|food|meals] [quiet]
import {
  blockedReason, createWorld, tick, day, hourOfDay, TICKS_PER_HOUR, alive, avgMood, built, bdef, beds, avgBeauty, World, Colonist, mealTotal, foodTotal,
} from '../src/sim/world';
import { CHARTERS, BUILDING_BY_ID } from '../src/sim/content';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';

const runs = Number(process.argv[2] ?? 8);
const base = Number(process.argv[3] ?? 777);
const depot = (process.argv[4] ?? 'food') as 'none' | 'food' | 'meals';
const quiet = process.argv.includes('quiet');
BOT.foodDepot = depot === 'none' ? false : depot;
if (process.env.BOT_ADVISOR) BOT.advisor = process.env.BOT_ADVISOR === '1';
if (process.env.BOT_LABORERS) BOT.laborersPer = Number(process.env.BOT_LABORERS);

const pct = (xs: number[], p: number) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const med = (xs: number[]) => pct(xs, 0.5);
const norm = (l: string) => l.replace(/^(Fell for|Broke up with|Insulted by|Has to work with|In love with) .*/, '$1 …').replace(/^\S+ (won’t stop complaining|is a ray of sunshine)/, '… $1').replace(/^Loves .*/, 'Loves their job').replace(/^Hates .*/, 'Hates their job').replace(/^Sick: .*/, 'Sick').replace(/^Ate raw .*/, 'Ate raw food').replace(/^\S+ (died|left me)$/, 'Lost someone close');

// aggregates over all runs
const agg = {
  won: 0, lost: 0, activity: {} as Record<string, number>, colonistHours: 0, eatingHours: 0, meals: 0,
  lowCauses: {} as Record<string, number>, lowSamples: 0, leaveCauses: {} as Record<string, number>, leavers: 0,
  spread: [] as { day: number; p10: number; p50: number; p90: number; min: number }[],
  quality: [] as { q: number; pre: number; mood: number }[],
  reactLow: 0, reactLowMoodBuild: 0, lowMoodDays: 0,
  staff: {} as Record<string, number>, staffSamples: 0, laborers: 0, sawBlocked: 0, sawHours: 0, woodLow: 0, hours: 0, planksZero: 0,
};

function quality(w: World) {
  const pop = Math.max(1, alive(w).length);
  const cozy = alive(w).filter(c => { const b = built(w).find(x => x.uid === c.bed); return b && bdef(b).bedQuality === 'cozy'; }).length / pop;
  const seats = Math.min(1, built(w).reduce((n, b) => n + (bdef(b).seats ?? 0), 0) / pop * 2);
  const tavern = built(w).some(b => b.def === 'tavern') && w.res.ale > 2 ? 1 : 0;
  const bath = built(w).some(b => b.def === 'bathhouse') ? 1 : 0;
  const stage = built(w).some(b => b.def === 'stage') ? 1 : 0;
  const meals = Math.min(1, mealTotal(w) / pop / 2);
  const beauty = Math.max(0, Math.min(1, avgBeauty(w) / 4));
  const bedsOk = Math.min(1, beds(w) / pop);
  return { q: cozy + seats + tavern + bath + stage + meals + beauty + bedsOk, parts: { cozy, seats, tavern, bath, stage, meals, beauty, bedsOk } };
}

for (let i = 0; i < runs; i++) {
  const w = createWorld(base + i * 7919);
  const story: string[] = [];
  const say = (s: string) => story.push(`  d${day(w)} ${String(Math.round(hourOfDay(w))).padStart(2, '0')}h  ${s}`);
  let knownUids = new Set(w.buildings.map(b => b.uid));
  let lastThoughts = new Map<number, { label: string; value: number }[]>();
  let lastLowDay = -1, lowSince = -1;
  const moodBuilds = new Set(['tavern', 'brewery', 'pieoven', 'bathhouse', 'cottage', 'stage', 'flowerbed', 'lantern', 'statue', 'dining']);
  const decide = () => {
    if (!w.decisions.length) return;
    const before = { charter: w.charter, owned: [...w.owned], perks: [...w.perks], ids: new Set(w.colonists.map(c => c.id)) };
    const pending = w.decisions.map(d => ({ ...d }));
    autoDecide(w);
    for (const d of pending) {
      if (d.kind === 'charter') say(`charter: took ${w.charter} from [${d.options.join(', ')}] (mood ${Math.round(avgMood(w))}, strain ${w.strain.toFixed(0)})`);
      if (d.kind === 'blueprint') say(`blueprint: took ${w.owned.filter(o => !before.owned.includes(o)).join(',') || '?'} from [${d.options.join(', ')}]`);
      if (d.kind === 'perk') say(`boon: ${w.perks.filter(o => !before.perks.includes(o)).join(',')}`);
      if (d.kind === 'recruit') { const got = w.colonists.filter(c => !before.ids.has(c.id)); say(got.length ? `recruit: took ${got.map(c => `${c.name.split(' ')[0]} (${c.traits.join('/')})`).join(', ')} → pop ${alive(w).length}, beds ${beds(w)}` : `recruit: declined → pop ${alive(w).length}`); }
      if (d.kind === 'event') say(`event: ${d.eventId}`);
    }
  };
  while (w.status === 'playing' && day(w) <= 40) {
    decide();
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); decide(); }
    autoBuild(w);
    const a = alive(w);
    // new buildings
    for (const b of w.buildings) if (!knownUids.has(b.uid)) { knownUids.add(b.uid); if (!quiet) say(`placed ${b.def}${b.high ? ' (high)' : ''}`); if (lowSince >= 0 && moodBuilds.has(b.def)) agg.reactLowMoodBuild++; }
    knownUids = new Set(w.buildings.map(b => b.uid));
    // departures: what were they thinking?
    for (const c of w.colonists) if (c.left && lastThoughts.has(c.id)) {
      const th = lastThoughts.get(c.id)!; lastThoughts.delete(c.id); agg.leavers++;
      const top = th.filter(t => t.value < 0).sort((x, y) => x.value - y.value).slice(0, 4);
      for (const t of top) agg.leaveCauses[norm(t.label)] = (agg.leaveCauses[norm(t.label)] ?? 0) + 1;
      say(`${c.died ? 'DIED' : 'LEFT'}: ${c.name} — ${top.map(t => `${norm(t.label)} ${t.value}`).join(', ')}`);
    }
    lastThoughts = new Map(a.map(c => [c.id, c.thoughts.map(t => ({ ...t }))]));
    for (const c of a) { agg.activity[c.activity] = (agg.activity[c.activity] ?? 0) + 1; agg.colonistHours++; if (c.activity === 'eating') agg.eatingHours++; }
    agg.hours++; if (w.res.wood < 20) agg.woodLow++; if (w.res.planks < 1) agg.planksZero++;
    for (const b of built(w)) if (b.def === 'sawmill') { agg.sawHours++; if (blockedReason(w, b)) agg.sawBlocked++; }
    // noon snapshot
    if (Math.round(hourOfDay(w)) === 12) {
      const moods = a.map(c => c.mood);
      const sp = { day: day(w), p10: pct(moods, 0.1), p50: med(moods), p90: pct(moods, 0.9), min: Math.min(...moods) };
      agg.spread.push(sp);
      agg.staffSamples++;
      for (const c of a) { const j = built(w).find(b => b.uid === c.job); const k = j ? j.def : 'laborer'; agg.staff[k] = (agg.staff[k] ?? 0) + 1; }
      const q = quality(w);
      const pre = avgMood(w) + w.strain;
      agg.quality.push({ q: q.q, pre, mood: avgMood(w) });
      // the unhappiest tenth: what's dragging them down
      for (const c of a.slice().sort((x, y) => x.mood - y.mood).slice(0, Math.max(1, Math.ceil(a.length / 10)))) {
        agg.lowSamples++;
        for (const t of c.thoughts.filter(t => t.value < 0 && !t.label.startsWith('The frontier')).sort((x, y) => x.value - y.value).slice(0, 3)) agg.lowCauses[norm(t.label)] = (agg.lowCauses[norm(t.label)] ?? 0) + 1;
      }
      if (avgMood(w) < 45) { agg.lowMoodDays++; if (lowSince < 0) lowSince = w.hour; } else lowSince = -1;
      if (!quiet) say(`noon: pop ${a.length} mood p10/med/p90 ${sp.p10.toFixed(0)}/${sp.p50.toFixed(0)}/${sp.p90.toFixed(0)} (min ${sp.min.toFixed(0)}) strain ${w.strain.toFixed(0)} · quality ${q.q.toFixed(1)} [${Object.entries(q.parts).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' ')}] · food ${Math.round(foodTotal(w))} wood ${Math.round(w.res.wood)} planks ${Math.round(w.res.planks)} · ${w.charter ?? '-'} ${CHARTERS.find(c => c.id === w.charter) ? '' : ''}`);
      void lastLowDay;
    }
  }
  if (w.status === 'won') agg.won++; else if (w.status === 'lost') agg.lost++;
  agg.meals += w.stats.mealsEaten;
  console.log(`=== run ${i} (seed ${base + i * 7919}): ${w.status} on day ${day(w)} · charters ${w.chartersDone.join(', ')} · lost ${w.stats.departures + w.stats.deaths}`);
  if (!quiet) console.log(story.join('\n'));
}

console.log(`\n##### ${runs} runs, depot=${depot}: won ${agg.won}, lost ${agg.lost}`);
const act = Object.entries(agg.activity).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / agg.colonistHours * 100).toFixed(0)}%`).join(' · ');
console.log(`Colonist time: ${act}`);
console.log(`Hours per meal (fetching + eating): ${(agg.eatingHours / Math.max(1, agg.meals)).toFixed(2)}`);
// mood spread by day bucket
for (const [lo, hi] of [[1, 5], [6, 10], [11, 15], [16, 25], [26, 40]]) {
  const s = agg.spread.filter(x => x.day >= lo && x.day <= hi); if (!s.length) continue;
  console.log(`Mood days ${lo}-${hi}: p10 ${med(s.map(x => x.p10)).toFixed(0)} · median ${med(s.map(x => x.p50)).toFixed(0)} · p90 ${med(s.map(x => x.p90)).toFixed(0)} · lowest ${med(s.map(x => x.min)).toFixed(0)} · gap median−p10 ${med(s.map(x => x.p50 - x.p10)).toFixed(0)}`);
}
// does mood track quality?
const qs = agg.quality;
const corr = (xs: number[], ys: number[]) => { const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length; let n = 0, dx = 0, dy = 0; for (let k = 0; k < xs.length; k++) { n += (xs[k] - mx) * (ys[k] - my); dx += (xs[k] - mx) ** 2; dy += (ys[k] - my) ** 2; } return n / Math.sqrt(dx * dy); };
console.log(`Settlement quality vs mood: r=${corr(qs.map(x => x.q), qs.map(x => x.mood)).toFixed(2)} with mood, r=${corr(qs.map(x => x.q), qs.map(x => x.pre)).toFixed(2)} with mood before strain`);
for (const [lo, hi] of [[0, 2], [2, 3], [3, 4], [4, 5], [5, 9]]) { const s = qs.filter(x => x.q >= lo && x.q < hi); if (s.length) console.log(`  quality ${lo}-${hi}: ${s.length} days, mood ${med(s.map(x => x.mood)).toFixed(0)}, before strain ${med(s.map(x => x.pre)).toFixed(0)}`); }
console.log(`Unhappiest tenth, top causes besides strain (share of samples):`);
for (const [k, v] of Object.entries(agg.lowCauses).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${(v / agg.lowSamples * 100).toFixed(0).padStart(3)}%  ${k}`);
console.log(`Leavers' worst thoughts (${agg.leavers} people):`);
for (const [k, v] of Object.entries(agg.leaveCauses).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${(v / Math.max(1, agg.leavers) * 100).toFixed(0).padStart(3)}%  ${k}`);
console.log(`Low-mood days (avg < 45 at noon): ${agg.lowMoodDays}; mood-related buildings placed during those stretches: ${agg.reactLowMoodBuild}`);
void BUILDING_BY_ID;
console.log(`Staffing at noon (avg people): ${Object.entries(agg.staff).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / agg.staffSamples).toFixed(1)}`).join(' · ')}`);
console.log(`Wood under 20: ${(agg.woodLow / agg.hours * 100).toFixed(0)}% of hours · planks at 0: ${(agg.planksZero / agg.hours * 100).toFixed(0)}% · sawmill idle for lack of wood: ${(agg.sawBlocked / Math.max(1, agg.sawHours) * 100).toFixed(0)}% of its hours`);
