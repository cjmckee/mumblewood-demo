// Where the notes-driven bot is weakest: which notes stay unresolved, and why their fixes don't happen.
// Runs each seed twice (own rules, then notes) and compares.
// Usage: npx tsx tools/notes.ts [runs=60] [seedBase=70000]
import { createWorld, tick, day, TICKS_PER_HOUR, alive, built, workersAt, bdef, World, sites, avgMood, stockOf } from '../src/sim/world';
import { BUILDING_BY_ID, CHARTERS, InputKey } from '../src/sim/content';
import { autoDecide, autoBuild, BOT, concernsOf, actedConcerns } from '../src/sim/autoplayer';
import { defsOf } from '../src/sim/advisor';

const runs = Number(process.argv[2] ?? 60);
const base = Number(process.argv[3] ?? 70000);
const play = (seed: number, advisor: boolean, onHour?: (w: World) => void) => {
  BOT.advisor = advisor;
  const w = createWorld(seed, 'normal');
  while (w.status === 'playing' && day(w) <= 45) {
    autoDecide(w); for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); autoDecide(w); } autoBuild(w);
    onHour?.(w);
  }
  return w;
};
const topHours: Record<string, number> = {}, actedHours: Record<string, number> = {}, waiting: Record<string, number> = {};
const fail: Record<string, Record<string, number>> = {};
const streaks: Record<string, number[]> = {};
const note = (id: string, why: string) => { const k = id.replace(/^idle-.*/, 'idle-workshop'); (fail[k] ??= {})[why] = (fail[k][why] ?? 0) + 1; };
let rulesWon = 0, notesWon = 0;
const flips: string[] = [];
for (let i = 0; i < runs; i++) {
  const seed = base + i * 104729;
  const r = play(seed, false);
  const open = new Map<string, number>();
  const recent: string[][] = [];
  const n = play(seed, true, w => {
    const all = concernsOf(w), acted = new Set(actedConcerns(w).map(c => c.id));
    const ids = new Set(all.slice(0, 3).map(c => c.id.replace(/^idle-.*/, 'idle-workshop')));
    for (const c of all.slice(0, 3)) { const k = c.id.replace(/^idle-.*/, 'idle-workshop'); topHours[k] = (topHours[k] ?? 0) + 1; if (acted.has(c.id)) actedHours[k] = (actedHours[k] ?? 0) + 1; else waiting[k] = (waiting[k] ?? 0) + 1; }
    for (const id of ids) open.set(id, (open.get(id) ?? 0) + 1);
    for (const [id, h] of open) if (!ids.has(id)) { (streaks[id] ??= []).push(h); open.delete(id); }
    recent.push([...ids]); if (recent.length > 120) recent.shift();
    // did the fixes it acted on actually happen?
    for (const c of actedConcerns(w)) for (const f of c.fixes) {
      if ('staff' in f) {
        const bs = built(w).filter(b => defsOf(f.staff).includes(b.def));
        const slots = bs.reduce((m, b) => m + bdef(b).slots, 0), have = bs.reduce((m, b) => m + workersAt(w, b.uid).length, 0);
        if (have >= f.n) continue;
        note(c.id, !bs.length ? `staff ${f.staff}: none built` : slots <= have ? `staff ${f.staff}: no open slots` : `staff ${f.staff}: no one free to assign`);
      } else if ('build' in f && f.build) {
        if (sites(w).some(b => b.def === f.build)) { note(c.id, `build ${f.build}: under construction`); continue; }
        const def = BUILDING_BY_ID[f.build];
        if (!w.owned.includes(f.build) && !def.basic) { note(c.id, `build ${f.build}: blueprint not owned`); continue; }
        const short = Object.entries(def.cost).filter(([res, amt]) => stockOf(w, res as InputKey) < (amt ?? 0) + (res === 'wood' ? 10 : 0)).map(([res]) => res);
        if (short.length) note(c.id, `build ${f.build}: can't afford (${short.join(', ')})`);
        else if (sites(w).length >= 2) note(c.id, `build ${f.build}: build queue full`);
      } else if ('draft' in f) note(c.id, `draft ${f.draft}: waiting for a draft`);
    }
  });
  for (const [id, h] of open) (streaks[id] ??= []).push(h);
  if (r.status === 'won') rulesWon++;
  if (n.status === 'won') notesWon++;
  if (r.status === 'won' && n.status !== 'won') {
    const counts: Record<string, number> = {};
    for (const ids of recent) for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    flips.push(`seed ${seed}: notes bot ${n.status} on day ${day(n)} (${CHARTERS.find(c => c.id === n.charter)?.name ?? 'between charters'}, mood ${Math.round(avgMood(n))}, pop ${alive(n).length}); rules bot won on day ${day(r)}. Last 5 days, top notes: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(v / recent.length * 100)}%`).join(', ')}`);
  }
}
const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const p90 = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : 0);
console.log(`${runs} seeds: rules bot won ${rulesWon}, notes bot won ${notesWon}`);
const total = Object.values(topHours).reduce((a, b) => a + b, 0);
console.log('\nNotes in the top 3 (share of note-hours) · acted on vs waiting on a healthy economy · how long they stay (median / 90th pct hours)');
for (const [k, v] of Object.entries(topHours).sort((a, b) => b[1] - a[1])) console.log(`  ${(v / total * 100).toFixed(0).padStart(3)}%  ${k.padEnd(15)} acted ${Math.round((actedHours[k] ?? 0) / v * 100)}% · waiting ${Math.round((waiting[k] ?? 0) / v * 100)}% · lasts ${med(streaks[k] ?? [])}h / ${p90(streaks[k] ?? [])}h`);
console.log('\nWhy acted-on fixes did not happen (fix-hours):');
for (const [k, m] of Object.entries(fail).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0)).slice(0, 10))
  console.log(`  ${k}: ${Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([why, v]) => `${why} ${v}`).join(' · ')}`);
console.log(`\nSeeds the rules bot won and the notes bot lost (${flips.length}):`);
for (const f of flips) console.log('  ' + f);
