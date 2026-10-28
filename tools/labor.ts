// How many hands the colony needs just to eat and keep warm. Over a few fixed runs (days 10-60) it measures:
//  - how the colony's people split: gatherers, cooks, woodcutters, laborers, and everyone else (research, workshops)
//  - what a settler uses a day (raw food, through eating, cooking and spoilage; wood) and what one gatherer, cook or
//    woodcutter brings in a day, so the share of the colony the economy itself demands: use per settler / output
//    per worker, added up. That share doesn't depend on how well the bot staffs, only on the game's numbers.
//  - where gatherers' working day goes.
// Tuning knobs (multiply or set), so balance ideas can be tried in a minute:
//   GATHER=1.3 (raw food and wood rates)  HUNGER=26 (waking hours from full to empty)  EAT_BELOW=45
//   STEW_RAW=1.5 (raw food per stew)  COOK=0.5 (meal recipes' food inputs)  HEARTH=0.5 (hearth burn)  SPOIL=0.035 (share a day)  WALK=7 (tiles an hour)  BOT='{...}'
// Usage: npx tsx tools/labor.ts [seeds=6] [days=60]
import { createWorld, tick, day, alive, TICKS_PER_HOUR, World, buildingByUid, hourOfDay, lastDay, lastDayHours } from '../src/sim/world';
import { autoDecide, autoBuild, BOT } from '../src/sim/autoplayer';
import { BASE_RATE, BUILDING_BY_ID, RAW_FOODS, MEALS, ResourceId } from '../src/sim/content';
import { START } from '../src/sim/scenario';

const env = process.env;
if (env.BOT) Object.assign(BOT, JSON.parse(env.BOT));
if (env.GATHER) for (const r of [...RAW_FOODS, 'wood'] as ResourceId[]) BASE_RATE[r] *= Number(env.GATHER);
if (env.HUNGER) START.body.hungerHours = Number(env.HUNGER);
if (env.EAT_BELOW) START.body.eatBelow = Number(env.EAT_BELOW);
if (env.SPOIL) START.body.spoilPerDay = Number(env.SPOIL);
if (env.WALK) START.body.walk = Number(env.WALK);
// COOK=0.5: every meal recipe takes that share of its food inputs (cooking stretches food instead of costing it)
if (env.COOK) for (const b of Object.values(BUILDING_BY_ID)) for (const r of b.recipes ?? []) if (MEALS.includes(r.output)) for (const k of Object.keys(r.inputs) as (keyof typeof r.inputs)[]) if (k !== 'wood') r.inputs[k] = r.inputs[k]! * Number(env.COOK);
if (env.HEARTH) { START.hearth.base *= Number(env.HEARTH); START.hearth.perPerson *= Number(env.HEARTH); }
if (env.STEW_RAW) for (const r of BUILDING_BY_ID.kitchen.recipes ?? []) if (r.output === 'stew') r.inputs = { rawFood: Number(env.STEW_RAW) };

const SEEDS = [1000, 8919, 16838, 32676, 48514, 56433, 72271, 88109];
const N = Number(process.argv[2] ?? 6), DAYS = Number(process.argv[3] ?? 60);
const GATHER = ['forager', 'dock', 'cellar', 'orchard'], COOK = ['kitchen', 'pieoven', 'smokehouse', 'bakery'];
const cat = (def: string | undefined) => (!def ? 'laborers' : GATHER.includes(def) ? 'gatherers' : COOK.includes(def) ? 'cooks' : def === 'woodcutter' ? 'woodcutters' : 'everyone else');
const share: Record<string, number> = {}; let popHours = 0;
const budget: Record<string, number> = {};
const tot = { rawUse: 0, rawMade: 0, woodUse: 0, woodMade: 0, mealsMade: 0, settlerDays: 0, gatherDays: 0, cutterDays: 0, cookDays: 0, rawEaten: 0, mealsEaten: 0, rawCooked: 0, warmth: 0 };
const outcomes: string[] = [];
const sinks: Record<string, Record<string, number>> = { raw: {}, wood: {}, meals: {} };
const labTime: Record<string, number> = {};
const sum = (ld: Record<string, number>, f: (g: string, s: string) => boolean) => Object.entries(ld).reduce((n, [k, v]) => { const [g, s] = k.split(':'); return s && f(g, s) ? n + v : n; }, 0);
for (const seed of SEEDS.slice(0, N)) {
  const w: World = createWorld(seed);
  let r = 1000 + Math.round((seed - 1000) / 7919); const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  let dayCounts = { g: 0, c: 0, k: 0, n: 0 };
  while (w.status === 'playing' && day(w) <= DAYS) {
    autoDecide(w, 'greedy', rand);
    for (let t = 0; t < TICKS_PER_HOUR; t++) {
      tick(w); if (w.decisions.length) autoDecide(w, 'greedy', rand);
      const h = hourOfDay(w);
      if (day(w) < 10 || h < 6 || h >= 18) continue;
      for (const c of alive(w)) {
        const j = buildingByUid(w, c.job);
        if (j && GATHER.includes(j.def)) { const st = c.activity === 'working' ? (c.goalReached ? 'working' : 'walking to work') : c.activity; budget[st] = (budget[st] ?? 0) + 1; }
      }
    }
    autoBuild(w);
    if (day(w) < 10) continue;
    // hourly: who does what
    for (const c of alive(w)) { const k = cat(buildingByUid(w, c.job)?.def); share[k] = (share[k] ?? 0) + 1; popHours++; }
    const people = alive(w).map(c => buildingByUid(w, c.job)?.def);
    dayCounts.g += people.filter(d => d && GATHER.includes(d)).length / 24; dayCounts.c += people.filter(d => d && COOK.includes(d)).length / 24; dayCounts.k += people.filter(d => d === 'woodcutter').length / 24; dayCounts.n += alive(w).length / 24;
    // daily: the last day's flows
    if (Math.round(hourOfDay(w)) === 5 && lastDayHours(w) >= 24) {
      const ld = lastDay(w);
      tot.rawUse += sum(ld, (g, s) => RAW_FOODS.includes(g as ResourceId) && s.startsWith('-'));
      tot.rawMade += sum(ld, (g, s) => RAW_FOODS.includes(g as ResourceId) && GATHER.some(x => s === `+${x}`));
      tot.woodUse += sum(ld, (g, s) => g === 'wood' && s.startsWith('-'));
      tot.woodMade += sum(ld, (g, s) => g === 'wood' && s === '+woodcutter');
      tot.mealsMade += sum(ld, (g, s) => MEALS.includes(g as ResourceId) && s.startsWith('+'));
      // subsistence: what's eaten, the raw food cooking used, and the wood that keeps the hearth and homes warm
      tot.rawEaten += sum(ld, (g, s) => RAW_FOODS.includes(g as ResourceId) && s === '-eaten');
      tot.mealsEaten += sum(ld, (g, s) => MEALS.includes(g as ResourceId) && s === '-eaten');
      tot.rawCooked += sum(ld, (g, s) => RAW_FOODS.includes(g as ResourceId) && COOK.some(x => s === `-${x}`));
      tot.warmth += sum(ld, (g, s) => g === 'wood' && (s === '-hearth' || s === '-homes'));
      for (const [k, v] of Object.entries(ld)) if (k.startsWith('time:laborer:')) labTime[k.slice(13)] = (labTime[k.slice(13)] ?? 0) + v;
      for (const [k, v] of Object.entries(ld)) {
        const [g, s] = k.split(':'); if (!s?.startsWith('-')) continue;
        const kind = RAW_FOODS.includes(g as ResourceId) ? 'raw' : MEALS.includes(g as ResourceId) ? 'meals' : g === 'wood' ? 'wood' : '';
        const why = s.startsWith('-build') ? 'building' : s.slice(1);
        if (kind) sinks[kind][why] = (sinks[kind][why] ?? 0) + v;
      }
      tot.settlerDays += dayCounts.n; tot.gatherDays += dayCounts.g; tot.cutterDays += dayCounts.k; tot.cookDays += dayCounts.c;
      dayCounts = { g: 0, c: 0, k: 0, n: 0 };
    }
  }
  outcomes.push(w.status === 'won' ? `won d${day(w)}` : w.status === 'lost' ? `lost d${day(w)}` : `${w.chartersDone.length} charters by d${day(w) - 1}`);
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`${N} runs, days 10-${DAYS}: ${outcomes.join(', ')}`);
console.log('\nwho does what (share of settler-hours):');
for (const k of ['gatherers', 'cooks', 'woodcutters', 'laborers', 'everyone else']) console.log(`  ${k.padEnd(14)} ${pct((share[k] ?? 0) / popHours)}`);
const rawPerSettler = tot.rawUse / tot.settlerDays, rawPerG = tot.rawMade / tot.gatherDays;
const woodPerSettler = tot.woodUse / tot.settlerDays, woodPerK = tot.woodMade / tot.cutterDays;
const mealsPerSettler = tot.mealsMade / tot.settlerDays, mealsPerCook = tot.mealsMade / tot.cookDays;
console.log('\nthe economy’s own demand:');
console.log(`  raw food: ${rawPerSettler.toFixed(2)} used per settler a day; a gatherer brings ${rawPerG.toFixed(1)} → ${pct(rawPerSettler / rawPerG)} of the colony gathering`);
console.log(`  meals:    ${mealsPerSettler.toFixed(2)} made per settler a day; a cook makes ${mealsPerCook.toFixed(1)} → ${pct(mealsPerSettler / mealsPerCook)} cooking`);
console.log(`  wood:     ${woodPerSettler.toFixed(2)} used per settler a day; a woodcutter brings ${woodPerK.toFixed(1)} → ${pct(woodPerSettler / woodPerK)} chopping`);
console.log(`  together: ${pct(rawPerSettler / rawPerG + mealsPerSettler / mealsPerCook + woodPerSettler / woodPerK)} of the colony on food and wood, before laborers`);
// subsistence only: raw food eaten, plus the raw food behind each meal eaten; the cooks those meals take; warmth
const rawPerMeal = tot.mealsMade ? tot.rawCooked / tot.mealsMade : 1.5;
const subRaw = (tot.rawEaten + tot.mealsEaten * rawPerMeal) / tot.settlerDays, subMeals = tot.mealsEaten / tot.settlerDays, subWood = tot.warmth / tot.settlerDays;
const sub = subRaw / rawPerG + subMeals / mealsPerCook + subWood / woodPerK;
console.log('\njust staying alive (food eaten, warmth):');
console.log(`  ${subRaw.toFixed(2)} raw food a settler a day (${(tot.rawEaten / tot.settlerDays).toFixed(2)} raw, ${subMeals.toFixed(2)} meals at ${rawPerMeal.toFixed(2)} raw each) → ${pct(subRaw / rawPerG)} gathering, ${pct(subMeals / mealsPerCook)} cooking`);
console.log(`  ${subWood.toFixed(2)} wood a settler a day for the hearth and homes → ${pct(subWood / woodPerK)} chopping`);
console.log(`  SUBSISTENCE: ${pct(sub)} of the colony; the rest of the food and wood work (${pct(Math.max(0, rawPerSettler / rawPerG + mealsPerSettler / mealsPerCook + woodPerSettler / woodPerK - sub))}) is building, stockpiling and spoilage`);
console.log('\nwhere it goes (share of use):');
for (const [kind, m] of Object.entries(sinks)) { const t = Object.values(m).reduce((a, b) => a + b, 0) || 1; console.log(`  ${kind.padEnd(6)} ` + Object.entries(m).sort((a, b) => b[1] - a[1]).filter(([, n]) => n / t >= 0.02).map(([k, n]) => `${k} ${pct(n / t)}`).join(' · ')); }
const lt = Object.values(labTime).reduce((a, b) => a + b, 0) || 1;
console.log('\na laborer’s day (6-18): ' + Object.entries(labTime).sort((a, b) => b[1] - a[1]).filter(([, n]) => n / lt >= 0.01).map(([k, n]) => `${k} ${pct(n / lt)}`).join(' · '));
const bt = Object.values(budget).reduce((a, b) => a + b, 0);
console.log('\na gatherer’s working day: ' + Object.entries(budget).sort((a, b) => b[1] - a[1]).filter(([, n]) => n / bt >= 0.01).map(([k, n]) => `${k} ${pct(n / bt)}`).join(' · '));
