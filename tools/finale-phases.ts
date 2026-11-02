// Where a finale's days go: hours by phase (waiting on goods or building, stage by stage), with a line whenever the
// phase changes and every other day: what's left, mood and how many can work on a mood-gated site, stock, routes,
// and drafts offered. Usage: npx tsx tools/finale-phases.ts <seed>
import { createWorld, tick, day, TICKS_PER_HOUR, alive, remainingCost, siteWork, avgMood, stockOf } from '../src/sim/world';
import { autoDecide, autoBuild, finaleRoutes } from '../src/sim/autoplayer';
const seed = Number(process.argv[2]); const w = createWorld(seed); let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
let last = '';
const hours: Record<string, number> = {};
while (w.status === 'playing' && day(w) <= 90) {
  autoDecide(w, 'greedy', rand);
  for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); for (const d of w.decisions) if (d.kind === 'blueprint' && (w.charter === 'hall' || w.charter === 'longtable') && w.hour % 1 < 0.2) console.log(`  draft d${day(w)} ${d.options.join(', ')}`); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
  autoBuild(w);
  if (w.charter !== 'hall' && w.charter !== 'longtable') continue;
  const b = w.buildings.find(x => x.def === 'hall' || x.def === 'pavilion');
  const left = b ? remainingCost(b) : null;
  const phase = !b ? 'no site' : b.built ? 'built, waiting on the feast' : Object.keys(left!).length ? `stage ${b.stage ?? 0}: waiting on goods` : `stage ${b.stage ?? 0}: building`;
  hours[phase] = (hours[phase] ?? 0) + 1;
  if (phase !== last || Math.round(w.hour) % 48 === 12) {
    const able = alive(w).filter(c => c.mood >= 55).length;
    console.log(`d${day(w)} h${Math.round(w.hour % 24)} ${phase} | left ${JSON.stringify(left)} work ${b?.progress.toFixed(1)}/${b ? siteWork(b) : ''} | mood ${avgMood(w).toFixed(0)}, ${able}/${alive(w).length} at 55+ | in store: meals ${stockOf(w, 'feastMeal')}, drinks ${stockOf(w, 'feastDrink')} | routes ${finaleRoutes(w).map(x => x.key + ': ' + x.steps.map(s => s.def).join('>')).join(' ; ')}`);
    last = phase;
  }
}
console.log(`END ${w.status} day ${day(w)} · days by phase: ${Object.entries(hours).map(([k, v]) => `${k} ${(v / 24).toFixed(1)}`).join(' · ')}`);
