// Pacing probe: when each charter is picked and finished, how research goes, and how population and
// strain grow. Targets: charter 1 by day 10-16, charter 2 by day 28-36, a win by day 50-60.
// Usage: npx tsx tools/pacing.ts [runs=60] [maxDays=90]   (VERBOSE=1 prints every run)
import { createWorld, tick, day, alive, avgMood, TICKS_PER_HOUR, World, charterDef, colonyComfort, comfortGaps } from '../src/sim/world';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
import { START } from '../src/sim/scenario';
// experiment knobs: STRAIN_K, DRAFT_EVERY, RECRUIT_CAP (bot), LABORERS_PER (bot)
if (process.env.STRAIN_K) START.strain.rate = Number(process.env.STRAIN_K);
if (process.env.DRAFT_EVERY) START.draftEvery = Number(process.env.DRAFT_EVERY);
if (process.env.RECRUIT_CAP) BOT.recruitCap = Number(process.env.RECRUIT_CAP);
if (process.env.LABORERS_PER) BOT.laborersPer = Number(process.env.LABORERS_PER);
if (process.env.RECRUIT_EXTRA) BOT.recruitExtra = Number(process.env.RECRUIT_EXTRA);
if (process.env.COMFORTS) BOT.comforts = process.env.COMFORTS === '1';
if (process.env.EFFORT_PICK) BOT.effortPick = process.env.EFFORT_PICK === '1';
if (process.env.MOOD_FESTIVAL) BOT.moodFestival = process.env.MOOD_FESTIVAL === '1';
if (process.env.FESTIVAL) BOT.festival = process.env.FESTIVAL === '1';
if (process.env.FESTIVAL_AT) BOT.festivalAt = Number(process.env.FESTIVAL_AT);
if (process.env.CHARTER_RELIEF) START.relief.charter = Number(process.env.CHARTER_RELIEF);
// seasons: PREP_FROM / PREP_FULL / PREP_SHARE (winter stores), WINTER_FORAGE (forager yield in winter), CHILL (chance a cold night gives a chill)
if (process.env.PREP_FROM) START.seasons.prep.from = Number(process.env.PREP_FROM);
if (process.env.PREP_FULL) START.seasons.prep.full = Number(process.env.PREP_FULL);
if (process.env.PREP_SHARE) START.seasons.prep.share = Number(process.env.PREP_SHARE);
if (process.env.WINTER_FORAGE) START.seasons.yield.forager.winter = Number(process.env.WINTER_FORAGE);
if (process.env.CHILL) START.seasons.chill.cold = Number(process.env.CHILL);
if (process.env.START_DAY) START.seasons.start.day = Number(process.env.START_DAY);
if (process.env.HARSH) START.seasons.harsh = Number(process.env.HARSH);
if (process.env.HARSH_YIELD) START.seasons.harshYield = Number(process.env.HARSH_YIELD);
if (process.env.INDOOR_WINTER) START.seasons.indoor.winter = Number(process.env.INDOOR_WINTER);
if (process.env.STRICTER_FROM) START.seasons.stricterFromYear = Number(process.env.STRICTER_FROM);
if (process.env.SUMMER_WORK) START.seasons.work.summer = process.env.SUMMER_WORK.split('-').map(Number) as [number, number];
if (process.env.RECRUIT_WINTER) START.seasons.recruitEvery.winter = Number(process.env.RECRUIT_WINTER);
if (process.env.RECRUIT_SPRING) START.seasons.recruitEvery.spring = Number(process.env.RECRUIT_SPRING);
if (process.env.COMFORTS_FIRST) BOT.comfortsFirst = process.env.COMFORTS_FIRST === '1';

// BOT='{"varietyRules":false}' switches bot behaviours for an A/B
if (process.env.BOT) Object.assign(BOT, JSON.parse(process.env.BOT));
const runs = Number(process.argv[2] ?? 60);
const maxDays = Number(process.argv[3] ?? 90);
const marks = [5, 10, 20, 30, 40, 50, 60];

interface Run {
  seed: number; status: string; day: number; peak: number; lost: number; deaths: number;
  offered: number | null; picks: { id: string; day: number }[]; dones: { id: string; day: number }[];
  research: { id: string; day: number }[]; pop: Record<number, number>; strain: Record<number, number>; mood: Record<number, number>; comfort: Record<number, number>; gaps: Record<number, Record<string, number>>;
}
const out: Run[] = [];
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919;
  const w: World = createWorld(seed);
  let r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const run: Run = { seed, status: 'timeout', day: 0, peak: 0, lost: 0, deaths: 0, offered: null, picks: [], dones: [], research: [], pop: {}, strain: {}, mood: {}, comfort: {}, gaps: {} };
  let lastCharter: string | null = null, doneN = 0, resN = 0;
  const watch = () => {
    if (w.charter && w.charter !== lastCharter) run.picks.push({ id: w.charter, day: day(w) });
    lastCharter = w.charter;
    if (w.chartersDone.length > doneN) { for (const id of w.chartersDone.slice(doneN)) run.dones.push({ id, day: day(w) }); doneN = w.chartersDone.length; }
    const rd = w.research?.done ?? [];
    if (rd.length > resN) { for (const id of rd.slice(resN)) run.research.push({ id, day: day(w) }); resN = rd.length; }
    if (run.offered == null && w.decisions.some(d => d.kind === 'charter')) run.offered = day(w);
  };
  while (w.status === 'playing' && day(w) <= maxDays) {
    watch(); autoDecide(w, 'greedy', rand); watch();
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) { watch(); autoDecide(w, 'greedy', rand); } watch(); }
    autoBuild(w);
    if (Math.round(w.hour) % 24 === 12 && marks.includes(day(w))) { run.pop[day(w)] = alive(w).length; run.strain[day(w)] = Math.round(w.strain); run.mood[day(w)] = Math.round(avgMood(w)); run.comfort[day(w)] = Math.round(colonyComfort(w) * 100); run.gaps[day(w)] = Object.fromEntries(comfortGaps(w).map(g => [g.need, Math.round(g.avg * 100)])); }
  }
  watch();
  run.status = w.status === 'playing' ? 'timeout' : w.status; run.day = day(w); run.peak = w.stats.peakPop;
  run.lost = w.stats.departures; run.deaths = w.stats.deaths;
  out.push(run);
  if (process.env.VERBOSE) console.log(`${seed} ${run.status} d${run.day} peak ${run.peak} · research ${run.research.map(x => `${x.id}@${x.day}`).join(' ')} · charters ${run.picks.map(p => `${p.id}@${p.day}${run.dones.find(d => d.id === p.id) ? `→${run.dones.find(d => d.id === p.id)!.day}` : ''}`).join(' ')} · lost ${run.lost}+${run.deaths}`);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pct = (n: number) => `${Math.round((n / runs) * 100)}%`;
const f1 = (n: number) => (Number.isNaN(n) ? '–' : n.toFixed(1));
console.log(`runs=${runs} maxDays=${maxDays}`);
for (const s of ['won', 'lost', 'timeout']) { const g = out.filter(x => x.status === s); console.log(`${s.padEnd(8)} ${pct(g.length).padStart(4)}  median day ${f1(med(g.map(x => x.day)))}  peak pop ${f1(avg(g.map(x => x.peak)))}`); }
console.log(`first charter offered: median day ${f1(med(out.map(x => x.offered ?? NaN).filter(x => !Number.isNaN(x))))}`);
for (let t = 0; t < 3; t++) {
  const done = out.map(x => x.dones[t]?.day).filter((x): x is number => x != null);
  console.log(`charter ${t + 1}: finished in ${pct(done.length)} · median day ${f1(med(done))} (p25 ${f1(med(done.filter(d => d <= med(done))))})`);
}
const all = new Map<string, { picked: number; done: number; days: number[] }>();
for (const x of out) for (const p of x.picks) {
  const e = all.get(p.id) ?? { picked: 0, done: 0, days: [] };
  e.picked++; const d = x.dones.find(q => q.id === p.id); if (d) { e.done++; e.days.push(d.day - p.day); }
  all.set(p.id, e);
}
console.log('charters picked → finished (median days to finish):');
for (const [id, e] of [...all].sort((a, b) => b[1].picked - a[1].picked)) console.log(`  ${(charterDef(id)?.name ?? id).padEnd(24)} ${String(e.picked).padStart(3)} → ${String(e.done).padStart(3)}  ${f1(med(e.days))}`);
const res = new Map<string, number[]>();
for (const x of out) x.research.forEach((q, i) => res.set(`${i + 1}. ${q.id}`, [...(res.get(`${i + 1}. ${q.id}`) ?? []), q.day]));
if (res.size) {
  console.log('research (order. project: runs, median day done):');
  for (const [k, ds] of [...res].sort()) console.log(`  ${k.padEnd(16)} ${String(ds.length).padStart(3)}  day ${f1(med(ds))}`);
}
console.log(`by day:   ${marks.map(m => `d${m}`.padStart(6)).join('')}`);
for (const [label, key] of [['pop', 'pop'], ['strain', 'strain'], ['mood', 'mood'], ['comfort %', 'comfort']] as const) console.log(`${label.padEnd(9)} ${marks.map(m => f1(avg(out.map(x => x[key][m]).filter(v => v != null))).padStart(6)).join('')}`);
for (const need of ['shelter', 'meals', 'evenings', 'health', 'surroundings']) console.log(`  ${need.padEnd(13)}${marks.map(m => f1(avg(out.map(x => x.gaps[m]?.[need]).filter(v => v != null))).padStart(6)).join('')}`);
console.log(`lost settlers: left ${f1(avg(out.map(x => x.lost)))} · died ${f1(avg(out.map(x => x.deaths)))}`);
