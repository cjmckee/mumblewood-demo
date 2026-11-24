// Which blueprints a run collects and builds, and how alike winning runs are. Usage: npx tsx tools/draft-paths.ts [runs=10] [maxDays=90]
import { createWorld, tick, day, TICKS_PER_HOUR, built } from '../src/sim/world';
import { autoDecide, autoBuild, finaleRoutes } from '../src/sim/autoplayer';
import { BUILDINGS } from '../src/sim/content';

const runs = Number(process.argv[2] ?? 10), maxDays = Number(process.argv[3] ?? 90);
const DRAFTABLE = new Set(BUILDINGS.filter(b => b.draftable).map(b => b.id));
for (let i = 0; i < runs; i++) {
  const seed = 1000 + (i + Number(process.env.SEED_FROM ?? 0)) * 7919;
  const w = createWorld(seed);
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const gained: string[] = [];
  let owned = new Set(w.owned), drafts = 0, routes = '';
  while (w.status === 'playing' && day(w) <= maxDays) {
    const pend = w.decisions.filter(d => d.kind === 'blueprint').length;
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
    void pend;
    for (const id of w.owned) if (!owned.has(id) && DRAFTABLE.has(id)) gained.push(`${id}@${day(w)}`);
    owned = new Set(w.owned);
    if (['hall', 'longtable'].includes(w.charter ?? '')) { const rs = finaleRoutes(w); if (rs.length) routes = rs.map(x => `${x.good}`).join('+'); }
  }
  drafts = w.log.filter(l => /blueprint/i.test(l.text)).length;
  const builtDraftable = [...new Set(built(w).map(b => b.def).filter(id => DRAFTABLE.has(id)))].sort();
  console.log(JSON.stringify({ seed, status: w.status, day: day(w), sites: w.sites, charters: w.chartersDone, finale: routes, gained, built: builtDraftable, drafts }));
}
