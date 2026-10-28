// The storyteller over a few bot runs: which events came, of which tier, when, and how the threat budget ran.
// Checks that major events keep their quiet spell and seasonal events stay in their seasons.
// Usage: npx tsx tools/story.ts [runs=6] [days=60]
import { createWorld, tick, day, TICKS_PER_HOUR, World, struggling } from '../src/sim/world';
import { autoDecide, autoBuild } from '../src/sim/autoplayer';
import { EVENTS, JOB_EVENTS } from '../src/sim/content';
import { seasonOf } from '../src/sim/seasons';
import { START } from '../src/sim/scenario';

const N = Number(process.argv[2] ?? 6), DAYS = Number(process.argv[3] ?? 60);
const tierOf = (id: string) => EVENTS.find(e => e.id === id)?.tier ?? JOB_EVENTS.find(j => j.id === id)?.tier ?? (id === 'flu' ? 'moderate' : '');
const seasonsOf = (id: string) => EVENTS.find(e => e.id === id)?.seasons ?? JOB_EVENTS.find(j => j.id === id)?.seasons;
let failed = 0; const total: Record<string, number> = {}; const byId: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const seed = 1000 + i * 7919, w: World = createWorld(seed);
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const seen: { day: number; id: string; tier: string; season: string; threat: number; down: boolean }[] = [];
  let errands = new Set<number>(), decisions = new Set<string>(), counts = { minor: 0, moderate: 0, major: 0 };
  while (w.status === 'playing' && day(w) <= DAYS) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) {
      const before = { ...(w.story?.counts ?? counts) };
      const down = struggling(w), threat = w.story?.threat ?? 0;
      tick(w);
      const now = w.story?.counts ?? counts;
      if (now.minor + now.moderate + now.major > before.minor + before.moderate + before.major) {
        const newErr = w.errands.find(e => !errands.has(e.id) && e.def !== 'caravan' && e.def !== 'remedy');
        const newDec = w.decisions.find(d => d.kind === 'event' && !decisions.has(`${d.eventId}@${w.hour}`));
        const id = newErr?.def ?? (newDec?.kind === 'event' ? newDec.eventId : 'flu');
        seen.push({ day: day(w), id, tier: tierOf(id), season: seasonOf(w).season, threat: Math.round(threat), down });
      }
      errands = new Set(w.errands.map(e => e.id)); decisions = new Set(w.decisions.filter(d => d.kind === 'event').map(d => `${(d as { eventId: string }).eventId}@${w.hour}`));
      if (w.decisions.length) autoDecide(w, 'greedy', rand);
    }
    autoBuild(w);
  }
  const majors = seen.filter(s => s.tier === 'major');
  for (let k = 1; k < majors.length; k++) if (majors[k].day - majors[k - 1].day < START.story.majorGap) { failed++; console.log(`  FAIL majors ${majors[k - 1].day} and ${majors[k].day} too close`); }
  for (const s of seen) { const ss = seasonsOf(s.id); if (ss && !ss.includes(s.season as never)) { failed++; console.log(`  FAIL ${s.id} in ${s.season}`); } }
  for (const s of seen) { total[s.tier] = (total[s.tier] ?? 0) + 1; byId[s.id] = (byId[s.id] ?? 0) + 1; }
  console.log(`seed ${seed}: ${w.status} d${day(w)} · ${seen.length} events (${['minor', 'moderate', 'major'].map(t => `${seen.filter(s => s.tier === t).length} ${t}`).join(', ')})`);
  console.log('   ' + seen.map(s => `d${s.day} ${s.tier === 'major' ? s.id.toUpperCase() : s.id}${s.down ? '*' : ''}`).join(' · '));
}
console.log(`\nper run: ${Object.entries(total).map(([k, v]) => `${k} ${(v / N).toFixed(1)}`).join(' · ')}`);
console.log('by event: ' + Object.entries(byId).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('(* the colony was struggling when it fired)');
console.log(failed ? `${failed} failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
