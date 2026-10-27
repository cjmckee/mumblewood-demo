// Is the bot behaving sensibly? Plays a fixed handful of runs and flags states a reasonable player wouldn't leave
// standing, so a bot fix can be checked in about a minute (same seeds before and after) instead of a 100-run batch.
// Usage: npx tsx tools/sanity.ts [seeds=8] [days=90]      BOT='{"bankDrinks":false}' to switch a behaviour off
import {
  createWorld, tick, day, alive, TICKS_PER_HOUR, World, built, workersAt, blockedReason, charterParts, charterDef, bdef,
  laborers, foodTotal, mealTotal, drinkTotal, winterStores, hourOfDay,
} from '../src/sim/world';
import { autoDecide, autoBuild, BOT, charterChain, drinksToBank, staffWants } from '../src/sim/autoplayer';
import { BUILDING_BY_ID, MEALS, CATEGORIES } from '../src/sim/content';
import { seasonOf } from '../src/sim/seasons';

if (process.env.BOT) Object.assign(BOT, JSON.parse(process.env.BOT));
// runs picked to cover different maps, charters and both winters, including ones the bot used to get stuck on
const SEEDS = [1000, 8919, 16838, 32676, 48514, 56433, 72271, 88109, 24757, 40595];
const N = Number(process.argv[2] ?? 8), DAYS = Number(process.argv[3] ?? 90);

type Flag = { key: string; day: number; note: string };
const FLAGS: Record<string, string> = {
  unbuilt: 'owns a building the charter needs but hasn’t placed it',
  unstaffed: 'a building the charter needs stands built, can run, and nobody works there',
  flipflop: 'food rules flipped back and forth (3+ changes in a day)',
  prephog: 'winter stores took over 60% of the jobs while the charter’s chain had nobody',
  tavern: 'the tavern poured drinks a finale was saving up',
  starving: 'someone went hungry with food in store',
  cold: 'someone was cold with wood in store',
  stuck: 'the same charter for 20+ days',
  idle: 'over half the laborers idle in the daytime while jobs wanted hands',
};

for (const seed of SEEDS.slice(0, N)) {
  const w: World = createWorld(seed);
  // the bot's own dice match the other tools (pacing, stuck), so a seed plays out the same everywhere
  let r = 1000 + Math.round((seed - 1000) / 7919); const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const flags: Flag[] = [];
  const flag = (key: string, note = '') => flags.push({ key, day: day(w), note });
  const charters: string[] = [];
  let cur = w.charter, since = 0, ruleFlips = 0, lastRules = '';
  const unbuiltSince: Record<string, number> = {};
  while (w.status === 'playing' && day(w) <= DAYS) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) { tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand); }
    autoBuild(w);
    const h = Math.round(hourOfDay(w)) % 24, d = day(w);
    // food rules: count changes through the day
    const rules = w.forbidden.slice().sort().join(',');
    if (rules !== lastRules) { ruleFlips++; lastRules = rules; }
    if (h === 0) { if (ruleFlips >= 3) flag('flipflop', `${ruleFlips} changes`); ruleFlips = 0; }
    if (w.charter !== cur) { if (cur && w.chartersDone.includes(cur)) charters.push(`${charterDef(cur)?.name} d${d}`); cur = w.charter; since = d; }
    if (h !== 12) continue;
    // ---- the daily checks, at noon ----
    const chain = w.charter ? charterChain(w) : [];
    for (const id of chain) {
      const placed = w.buildings.some(b => b.def === id);
      if (w.owned.includes(id) && !placed) { unbuiltSince[id] ??= d; if (d - unbuiltSince[id] >= 5) flag('unbuilt', BUILDING_BY_ID[id]?.name ?? id); }
      else delete unbuiltSince[id];
      for (const b of built(w).filter(b => b.def === id)) if (bdef(b).slots && !blockedReason(w, b) && !workersAt(w, b.uid).length) flag('unstaffed', BUILDING_BY_ID[id]?.name ?? id);
    }
    const ws = winterStores(w);
    if (ws.food + ws.wood > 0) {
      const jobs = alive(w).filter(c => c.job != null);
      const prep = jobs.filter(c => ['forager', 'dock', 'cellar', 'orchard', 'woodcutter'].includes(w.buildings.find(b => b.uid === c.job)?.def ?? '')).length;
      const chainIdle = chain.some(id => built(w).some(b => b.def === id && bdef(b).slots && !workersAt(w, b.uid).length && !blockedReason(w, b)));
      if (jobs.length >= 4 && prep / jobs.length > 0.6 && chainIdle) flag('prephog', `${prep}/${jobs.length} on food and wood`);
    }
    if (drinksToBank(w) > 0 && built(w).some(b => b.def === 'tavern' && workersAt(w, b.uid).length)) flag('tavern');
    const allowed = foodTotal(w) - w.forbidden.reduce((n, f) => n + w.res[f], 0);
    if (alive(w).some(c => c.hunger <= 0) && allowed >= alive(w).length) flag('starving', `${Math.floor(allowed)} food allowed`);
    if (alive(w).some(c => c.cold) && w.res.wood >= 20) flag('cold', `${Math.floor(w.res.wood)} wood`);
    if (w.charter && d - since >= 20 && (d - since) % 5 === 0) flag('stuck', `${charterDef(w.charter)?.name}: ${charterParts(w).filter(p => !p.met).map(p => p.label).join(' · ')}`);
    const idle = laborers(w).filter(c => c.activity === 'idle').length;
    const sw = staffWants(w), short = Object.entries(sw).some(([k, n]) => n > 0 && built(w).some(b => b.def === k && bdef(b).slots && workersAt(w, b.uid).length < Math.min(n, bdef(b).slots) && !blockedReason(w, b)));
    if (laborers(w).length >= 3 && idle / laborers(w).length > 0.5 && short) flag('idle', `${idle}/${laborers(w).length}`);
    void mealTotal; void drinkTotal; void MEALS; void CATEGORIES; void seasonOf;
  }
  // ---- report: outcome, charters, then each flag as day ranges ----
  const out = w.status === 'won' ? `WON d${day(w)}` : w.status === 'lost' ? `COLLAPSED d${day(w)}` : `still going d${day(w)} on ${charterDef(w.charter)?.name ?? 'no charter'}`;
  console.log(`\nseed ${seed}: ${out}  |  ${charters.join(' → ') || 'no charter finished'}`);
  const byKey: Record<string, Flag[]> = {};
  for (const f of flags) (byKey[f.key] ??= []).push(f);
  if (!flags.length) console.log('  no flags');
  for (const [k, fs] of Object.entries(byKey)) {
    const days = [...new Set(fs.map(f => f.day))].sort((a, b) => a - b);
    const ranges: string[] = []; let a = days[0], z = days[0];
    for (const x of days.slice(1)) { if (x === z + 1) z = x; else { ranges.push(a === z ? `${a}` : `${a}-${z}`); a = z = x; } }
    ranges.push(a === z ? `${a}` : `${a}-${z}`);
    const notes = [...new Set(fs.map(f => f.note).filter(Boolean))].slice(0, 3).join('; ');
    console.log(`  ${k.padEnd(9)} days ${ranges.join(',')}${notes ? `  (${notes})` : ''}`);
  }
}
console.log('\nflags:'); for (const [k, v] of Object.entries(FLAGS)) console.log(`  ${k.padEnd(9)} ${v}`);
