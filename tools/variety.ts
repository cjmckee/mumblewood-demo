// How different are runs? Blueprint coverage, draft-to-built lag, events seen, recruits, decision counts.
import { createWorld, tick, day, alive, TICKS_PER_HOUR, World, built } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { BUILDINGS } from '../src/sim/content';

const runs = Number(process.argv[2] ?? 80);
const pool = BUILDINGS.filter(b => b.draftable).map(b => b.id);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const lag: Record<string, number[]> = {}, neverBuilt: Record<string, number> = {};
const coverage: number[] = [], decisionsPerDay: number[] = [], eventsSeen: number[] = [], distinctEvents: number[] = [], recruitsSkipped: number[] = [];
let lakeSides: Record<string, number> = {};
for (let i = 0; i < runs; i++) {
  const w: World = createWorld(1000 + i * 7919);
  const draftedAt: Record<string, number> = {}, builtAt: Record<string, number> = {};
  let decisions = 0, skipped = 0; const evIds = new Set<string>(); let evCount = 0;
  // water layout: which quadrant holds most water
  const q = [0, 0, 0, 0]; w.terrain.forEach((t, k) => { if (t === 3) q[(k % 32 < 16 ? 0 : 1) + (Math.floor(k / 32) < 16 ? 0 : 2)]++; });
  const side = ['NW', 'NE', 'SW', 'SE'][q.indexOf(Math.max(...q))]; lakeSides[side] = (lakeSides[side] ?? 0) + 1;
  const seenDecision = new Set<any>();
  while (w.status === 'playing' && day(w) <= 90) {
    for (const d of w.decisions) if (!seenDecision.has(d)) { seenDecision.add(d); decisions++; if (d.kind === 'event') { evIds.add(d.eventId); evCount++; } }
    const pop = alive(w).length; const ownedBefore = new Set(w.owned);
    autoDecide(w);
    for (const id of w.owned) if (!ownedBefore.has(id) && draftedAt[id] == null) draftedAt[id] = w.hour / 24;
    for (let t = 0; t < TICKS_PER_HOUR; t++) {
      tick(w);
      for (const d of w.decisions) if (!seenDecision.has(d)) { seenDecision.add(d); decisions++; if (d.kind === 'event') { evIds.add(d.eventId); evCount++; } }
      const ob = new Set(w.owned); if (w.decisions.length) autoDecide(w);
      for (const id of w.owned) if (!ob.has(id) && draftedAt[id] == null) draftedAt[id] = w.hour / 24;
    }
    autoBuild(w);
    for (const e of w.errands) evIds.add('errand:' + e.def);
    for (const b of built(w)) if (pool.includes(b.def) && builtAt[b.def] == null) builtAt[b.def] = w.hour / 24;
    void pop;
  }
  for (const id of Object.keys(draftedAt)) { if (builtAt[id] != null) (lag[id] ??= []).push(builtAt[id] - draftedAt[id]); else neverBuilt[id] = (neverBuilt[id] ?? 0) + 1; }
  coverage.push(w.owned.filter(id => pool.includes(id)).length / pool.length);
  decisionsPerDay.push(decisions / day(w)); eventsSeen.push(evCount); distinctEvents.push(evIds.size); recruitsSkipped.push(skipped);
}
console.log(`runs=${runs}  draftable pool=${pool.length}`);
console.log(`blueprint pool owned at end: avg ${(avg(coverage) * 100).toFixed(0)}%, runs owning >=75%: ${coverage.filter(c => c >= 0.75).length}/${runs}`);
console.log(`decisions per day ${avg(decisionsPerDay).toFixed(2)}  choice events per run ${avg(eventsSeen).toFixed(1)}  distinct events+errands seen ${avg(distinctEvents).toFixed(1)}`);
console.log(`lake quadrant: ${JSON.stringify(lakeSides)}`);
console.log('blueprint        drafted→built days (median)  never built');
for (const id of pool) { const xs = (lag[id] ?? []).sort((a, b) => a - b); console.log(`${id.padEnd(16)} ${xs.length ? xs[Math.floor(xs.length / 2)].toFixed(1).padStart(5) : '   - '}  (n=${xs.length})   ${neverBuilt[id] ?? 0}`); }
