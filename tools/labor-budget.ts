// Labor budget: where colonists' working hours go, by colony size. Small samples, read closely.
// For each run: every colonist-tick inside work hours is put in one bucket (making goods, standing at a stalled
// workshop, walking to work, fetching for their own workshop, hauling, building, idle laborer, eating, sick...).
// Usage: npx tsx tools/labor-budget.ts [runs=4] [maxDays=90]
//   RECRUIT_CAP=99 takes every recruit (a human-like player); default is the bot's own cap
//   BOT_JSON='{...}' any bot switch; SEED_FROM=n shifts the seeds; DAYS=10,20,40 the snapshot days
import { createWorld, tick, day, alive, TICKS_PER_HOUR, World, built, bdef, buildingByUid, workersAt, currentRecipe, enabledRecipes, inInbox, OUTBOX_CAP, workHours, hourOfDay, Colonist, Building } from '../src/sim/world';
import type { InputKey } from '../src/sim/content';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';

if (process.env.BOT_JSON) Object.assign(BOT, JSON.parse(process.env.BOT_JSON));
if (process.env.RECRUIT_CAP) BOT.recruitCap = Number(process.env.RECRUIT_CAP);
const runs = Number(process.argv[2] ?? 4), maxDays = Number(process.argv[3] ?? 90);
const SNAP = (process.env.DAYS ?? '10,20,30,45,60').split(',').map(Number);
const sum = (o: Record<string, number | undefined>) => Object.values(o).reduce((a: number, b) => a + (b ?? 0), 0);

/** would this workshop make anything this tick? (mirrors produce() in world.ts) */
function stalled(w: World, b: Building) {
  if (!bdef(b).recipes) return false;
  if (sum(b.outbox) >= OUTBOX_CAP) return 'full';
  const has = (r: { inputs: Record<string, number> }) => Object.keys(r.inputs).every(k => inInbox(b, k as InputKey) > 0);
  const cur = currentRecipe(w, b);
  const rec = cur && has(cur) ? cur : (enabledRecipes(b, w).find(has) ?? cur);
  if (!rec) return 'off';
  return has(rec) ? false : 'dry';
}
function bucket(w: World, c: Colonist): string {
  const a = c.activity;
  if (a === 'working') {
    const b = buildingByUid(w, c.job);
    if (!b) return 'other';
    if (!c.goalReached) return 'walk to job';
    const s = stalled(w, b);
    if (s) return `stalled (${s})`;
    return bdef(b).recipes ? 'making' : 'service';
  }
  if (a === 'hauling') return c.job != null ? 'job fetch/haul' : 'laborer haul';
  if (a === 'building') return 'building';
  if (a === 'cleaning') return 'cleaning';
  if (a === 'idle') return 'idle';
  return a;
}

const tot: Record<string, Record<string, number>> = {};
const add = (k: string, b: string, n = 1) => { (tot[k] ??= {})[b] = (tot[k][b] ?? 0) + n; };
for (let i = 0; i < runs; i++) {
  const seed = 1000 + (i + Number(process.env.SEED_FROM ?? 0)) * 7919;
  const w = createWorld(seed);
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const snaps: string[] = [];
  const mine: Record<string, Record<string, number>> = {};
  while (w.status === 'playing' && day(w) <= maxDays) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) {
      tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand);
      const h = hourOfDay(w), [wake, dusk] = workHours(w);
      if (h < wake || h >= dusk) continue;
      const pop = alive(w).length, band = pop <= 6 ? '≤6' : pop <= 9 ? '7–9' : pop <= 12 ? '10–12' : pop <= 15 ? '13–15' : '16+';
      for (const c of alive(w)) { const b = bucket(w, c); add(band, b); (mine[band] ??= {})[b] = (mine[band][b] ?? 0) + 1; }
    }
    autoBuild(w);
    if (Math.round(w.hour) % 24 === 12 && SNAP.includes(day(w))) {
      const jobs: Record<string, number> = {};
      for (const b of built(w)) { const n = workersAt(w, b.uid).length; if (n) jobs[b.def] = (jobs[b.def] ?? 0) + n; }
      const lab = alive(w).filter(c => c.job == null).length;
      const tr = alive(w).filter(c => c.trade), sk = tr.length ? tr.reduce((n, c) => n + c.skills[c.trade!], 0) / tr.length : 0;
      const st = built(w).filter(b => workersAt(w, b.uid).length && stalled(w, b)).map(b => `${b.def}:${stalled(w, b)}`);
      snaps.push(`  d${day(w)} pop ${alive(w).length} · laborers ${lab} · ${Object.entries(jobs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}${st.length ? ` · stalled now: ${st.join(' ')}` : ''} · trade skill ${sk.toFixed(1)} · charter ${w.charter ?? '-'} (${w.chartersDone.length} done)`);
    }
  }
  console.log(`seed ${seed}: ${w.status} day ${day(w)}, peak ${w.stats.peakPop}, left ${w.stats.departures}, died ${w.stats.deaths}`);
  console.log(snaps.join('\n'));
}
const ORDER = ['making', 'service', 'stalled (dry)', 'stalled (full)', 'stalled (off)', 'walk to job', 'job fetch/haul', 'laborer haul', 'building', 'cleaning', 'idle', 'eating', 'leisure', 'sick', 'sulking', 'errand', 'dressing', 'sleeping', 'other'];
console.log('\nshare of work-hours by colony size (all runs):');
const bands = ['≤6', '7–9', '10–12', '13–15', '16+'].filter(b => tot[b]);
console.log(`${''.padEnd(16)}${bands.map(b => b.padStart(8)).join('')}`);
for (const k of ORDER) {
  if (!bands.some(b => tot[b][k])) continue;
  console.log(`${k.padEnd(16)}${bands.map(b => `${((tot[b][k] ?? 0) / sum(tot[b]) * 100).toFixed(1)}%`.padStart(8)).join('')}`);
}
console.log(`${'colonist-hours'.padEnd(16)}${bands.map(b => String(Math.round(sum(tot[b]) / TICKS_PER_HOUR)).padStart(8)).join('')}`);
