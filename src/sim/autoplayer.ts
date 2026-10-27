// A heuristic player, used by the balance harness to play thousands of runs headlessly.
// It reads the active charter and plays towards it, the way a person would.
import { BUILDING_BY_ID, BUILDINGS, CATEGORIES, CharterMetric, RESEARCH_BY_ID, EVENTS, ResourceId, MEALS, RAW_FOODS, Recipe, InputKey, membersOf, recipeRate } from './content';
import { assess, Concern, defsOf } from './advisor';
import { World, apply, alive, beds, mealTotal, sites, findSpot, CENTER, avgMood, built, MAP_SIZE, pathAt, terrainAt, T_WATER, bdef, workersAt, blockedReason, opinion, Building, Colonist, hourOfDay, charterProgress, buildingByUid, storageFree, storages, FOODS, GOODS, bedridden, foodTotal, currentRecipe, drinkTotal, siteOk, enabledRecipes, recipesOf, rerollCost, stockOf, usableHere, charterDef, charterHelpers, feastCheck, desks, researchLeft, festivalPreview, edibleTotal, doorTile, centerOf, winterStores, storageCap, stored, lastDay, lastDayHours, remainingCost } from './world';
import { seasonOf } from './seasons';

const BLUEPRINT_PRIORITY = ['sawmill', 'pieoven', 'dock', 'cottage', 'brewery', 'ciderpress', 'tavern', 'kiln', 'claypit', 'carpenter', 'orchard', 'field', 'apiary', 'smokehouse', 'cellar', 'stage', 'bathhouse', 'bakery', 'apothecary', 'herbgarden', 'mill'];
const DRINK_MAKERS = ['brewery', 'ciderpress'];
/** workshops that make planks, bricks or wicker */
const FINE_MAKERS = ['sawmill', 'kiln', 'carpenter'];
const rawStock = (w: World) => RAW_FOODS.reduce((n, r) => n + w.res[r], 0);
/** gatherers (no inputs) the colony owns that make r, on this map */
const gatherersOf = (w: World, r: string) => BUILDINGS.filter(d => w.owned.includes(d.id) && siteOk(w, d) && (d.recipes ?? []).some(x => x.output === r && !Object.keys(x.inputs).length)).map(d => d.id);
/** the best switched-on recipe a workshop could run once its gatherers are going: every input has a built or owned gatherer here */
function plannedRecipe(w: World, b: Building): Recipe | undefined {
  return enabledRecipes(b).find(r => Object.keys(r.inputs).every(k => membersOf(k as InputKey).some(m => suppliable(w, m, 2))));
}
/** a good the colony can get: gathered by something owned, or made by an owned workshop from goods it can get (flour from grain) */
function suppliable(w: World, r: ResourceId, depth: number): boolean {
  if (gatherersOf(w, r).length) return true;
  if (depth <= 0) return false;
  return BUILDINGS.some(d => w.owned.includes(d.id) && (d.recipes ?? []).some(x => x.output === r && Object.keys(x.inputs).length && Object.keys(x.inputs).every(k => membersOf(k as InputKey).some(m => suppliable(w, m, depth - 1)))));
}
/** gatherers the colony's built workshops are counting on: what their planned recipes take */
function neededGatherers(w: World): string[] {
  const out = new Set<string>();
  for (const b of built(w)) {
    if (!recipesOf(b).length) continue;
    const r = plannedRecipe(w, b); if (!r) continue;
    for (const k of Object.keys(r.inputs)) for (const m of membersOf(k as InputKey)) for (const g of gatherersOf(w, m)) if (!['forager', 'woodcutter'].includes(g)) out.add(g);
  }
  return [...out];
}
/** how many of these goods some built workshop could make with what the colony can get */
const kindsMakeable = (w: World, goods: ResourceId[]) => goods.filter(r => built(w).some(b => enabledRecipes(b).some(x => x.output === r && Object.keys(x.inputs).every(k => membersOf(k as InputKey).some(m => suppliable(w, m, 2)))))).length;
/** kinds of meal, drink or fine material that owning this blueprint would let the colony make, that it can't make now */
function newKinds(w: World, id: string) {
  const goods = [...CATEGORIES.meal.members, ...CATEGORIES.drink.members, ...CATEGORIES.fine.members];
  const can = (r: ResourceId, owned: string[]) => BUILDINGS.some(d => owned.includes(d.id) && siteOk(w, d) && (d.recipes ?? []).some(x => x.output === r && Object.keys(x.inputs).every(k => membersOf(k as InputKey).some(m => BUILDINGS.some(g => owned.includes(g.id) && siteOk(w, g) && (g.recipes ?? []).some(y => y.output === m))))));
  return goods.filter(r => !can(r, w.owned) && can(r, [...w.owned, id])).length;
}
const plannedUses = (w: World, input: ResourceId) => built(w).some(b => { const r = plannedRecipe(w, b); return !!r && Object.keys(r.inputs).some(k => membersOf(k as InputKey).includes(input)); });
const PERK_PRIORITY = ['homesteaders', 'postRider', 'saintsDay', 'ironWill', 'hearthSongs', 'communalPot', 'overtime', 'rations', 'earplugs', 'warmHearth', 'gossipBan', 'matchmaker'];
const MOOD_BUILDINGS = ['tavern', 'brewery', 'ciderpress', 'pieoven', 'bathhouse', 'cottage', 'stage'];
/** the parts of the current charter (an all-at-once charter has several) */
const partsOf = (w: World): CharterMetric[] => { const m = charterDef(w.charter)?.metric; return !m ? [] : m.kind === 'all' ? m.parts : [m]; };
/** a charter that needs contented people: one with a mood condition, or a finale */
const moodCharter = (w: World) => partsOf(w).some(p => ['avgMood', 'monument', 'longTable'].includes(p.kind));
/** what each charter leans on, for staffing */
const FOCUS: Record<string, string[]> = {
  settled: ['kitchen', 'rawFood'], woodsmoke: ['smokehouse', 'rawFood'], firstplanks: ['sawmill', 'kiln', 'claypit', 'woodcutter'], rested: ['kitchen', 'rawFood', 'woodcutter'],
  bread: ['field', 'mill', 'bakery'], piesky: ['field', 'mill', 'pieoven', 'rawFood'], twokitchens: ['kitchen', 'smokehouse', 'pieoven', 'bakery', 'rawFood'],
  roof: ['sawmill', 'kiln', 'drinks', 'field', 'apiary'], hearty: ['apothecary', 'herbgarden', 'apiary', 'clinic'],
  menu: ['kitchen', 'smokehouse', 'pieoven', 'bakery', 'rawFood'], tasting: ['drinks', 'apothecary', 'herbgarden', 'field', 'apiary'],
  hall: ['sawmill', 'kiln', 'claypit', 'woodcutter', 'kitchen', 'drinks', 'field'], longtable: ['kitchen', 'drinks', 'smokehouse', 'pieoven', 'bakery', 'field', 'tavern', 'rawFood'],
};
/** research the bot wants first: what fixes today's problems, then the rest in a sensible order */
const RESEARCH_ORDER = ['cookery', 'messhall', 'physick', 'warehousing', 'gardening', 'masonry'];
function researchParts(w: World, id: string): Record<string, number> {
  const p: Record<string, number> = { 'usual order': -RESEARCH_ORDER.indexOf(id) };
  if (id === 'physick' && alive(w).some(c => c.illness)) p['someone is ill'] = 10;
  if (id === 'warehousing' && storages(w).every(b => (bdef(b).storage ?? 0) - Object.values(b.stock).reduce((n, x) => n + (x ?? 0), 0) < 40)) p['storage nearly full'] = 4;
  void RESEARCH_BY_ID;
  return p;
}
const researchScore = (w: World, id: string) => sumParts(researchParts(w, id));
// ---------- Charter effort ----------
/**
 * Rough work to start making a good: 0 when something built makes it, 1 for each owned building still to put up, 3 for
 * each blueprint still to be drafted (luck), and the same again for whatever it's made from. 50 means this map can't.
 */
export function goodCost(w: World, r: ResourceId, depth = 3): number {
  if (['wood', 'berries'].includes(r)) return 0;
  // a building still behind research costs a study (about two), like a draft costs luck
  const step = (id: string) => (built(w).some(b => b.def === id) ? 0 : w.owned.includes(id) ? 1 : researchLeft(w).some(r => r.unlocks.includes(id)) ? 2 : BUILDING_BY_ID[id].draftable ? 3 : 50);
  let best = 50;
  for (const d of BUILDINGS) {
    if (!siteOk(w, d)) continue;
    for (const rec of d.recipes ?? []) {
      if (rec.output !== r) continue;
      let c = step(d.id);
      if (c >= best) continue;
      if (depth <= 0 && Object.keys(rec.inputs).length) continue;
      for (const k of Object.keys(rec.inputs)) c += Math.min(...membersOf(k as InputKey).map(m => goodCost(w, m, depth - 1)));
      best = Math.min(best, c);
    }
  }
  return best;
}
const cheapest = (w: World, goods: ResourceId[]) => Math.min(...goods.map(g => goodCost(w, g)));
/** for the founders' feast: kinds of meal and drink the colony makes now, and the settlers none of them would suit */
function feastGaps(w: World) {
  const making = (cat: 'meal' | 'drink') => CATEGORIES[cat].members.filter(r => w.res[r] >= 1 || goodCost(w, r) === 0);
  const meals = making('meal'), drinks = making('drink');
  const unsuited = (goods: ResourceId[]) => alive(w).filter(c => !goods.some(g => !c.tastes.dislikes.includes(g)));
  return { meals, drinks, noMeal: unsuited(meals), noDrink: unsuited(drinks) };
}
/** the next kind that would suit the most unsuited settlers, cheapest first */
function nextKind(w: World, cat: 'meal' | 'drink', have: ResourceId[], people: Colonist[]) {
  const options = CATEGORIES[cat].members.filter(r => !have.includes(r) && goodCost(w, r) < 50);
  return options.sort((a, b) => people.filter(c => !c.tastes.dislikes.includes(b)).length - people.filter(c => !c.tastes.dislikes.includes(a)).length || goodCost(w, a) - goodCost(w, b))[0];
}
/** how far a charter is from done, part by part: the bot picks the charter with the least left to do */
export function charterEffort(w: World, id: string): Record<string, number> {
  const def = charterDef(id)!;
  const parts = def.metric.kind === 'all' ? def.metric.parts : [def.metric];
  const pop = alive(w).length;
  const log = w.moodLog ?? [];
  const mood = log.length ? log.reduce((a, b) => a + b, 0) / log.length : avgMood(w);
  const out: Record<string, number> = {};
  const add = (k: string, v: number) => { if (v) out[k] = Math.round(((out[k] ?? 0) + v) * 10) / 10; };
  for (const p of parts) switch (p.kind) {
    case 'population': add(`${Math.max(0, p.amount - pop)} more settlers`, Math.max(0, p.amount - pop) * 0.4); break;
    case 'avgMood': add(`mood ${Math.round(mood)} → ${p.amount}`, Math.max(0, p.amount - mood) / 4); break;
    case 'stock': {
      const have = p.resources.reduce((n, r) => n + w.res[r], 0);
      if (have < p.amount) add(`make ${p.resources.length > 3 ? 'them' : p.resources.join('/')}`, cheapest(w, p.resources) + 2 * (1 - have / p.amount));
      break;
    }
    case 'variety': {
      const costs = CATEGORIES[p.category].members.map(r => (w.res[r] >= p.each ? 0 : goodCost(w, r) + 1)).sort((a, b) => a - b).slice(0, p.kinds);
      add(`${p.kinds} kinds of ${p.category}`, costs.reduce((a, b) => a + b, 0));
      break;
    }
    case 'built': {
      const n = built(w).filter(b => b.def === p.def).length;
      if (n < p.amount) add(`${p.amount - n} more ${p.def}s`, (p.amount - n) * 0.7 + (w.owned.includes(p.def) ? 0 : 3) + (BUILDING_BY_ID[p.def].cost.fine ? cheapest(w, CATEGORIES.fine.members) : 0));
      break;
    }
    case 'everyoneBed': add('beds', Math.max(0, pop - beds(w)) * 0.3); break;
    case 'allTable': add('a table for everyone', built(w).some(b => b.def === 'dining') ? 0.5 : w.owned.includes('dining') ? 1.5 : 2.5); if (p.cooked) add('cooked meals for everyone', cheapest(w, MEALS) + 1); break;
    case 'healthy': add('a day with nobody sick', 1); break;
    case 'monument': {
      add('the Hall: planks, meals, drinks', cheapest(w, CATEGORIES.fine.members) + cheapest(w, MEALS) + cheapest(w, CATEGORIES.drink.members) + 3);
      // only happy settlers will build it, so a glum town has a long way to go first
      const gate = BUILDING_BY_ID[p.def].moodGate ?? 0;
      if (BOT.hallMood && gate) add(`only settlers at mood ${gate}+ build it (mood is ${Math.round(mood)})`, Math.max(0, gate + 5 - mood) / 2);
      break;
    }
    case 'longTable': {
      add(`${Math.max(0, p.pop - pop)} more settlers`, Math.max(0, p.pop - pop) * 0.4);
      const g = feastGaps(w);
      // each settler no kind on hand would suit needs another kind; a drink at all is the first step
      const drinkStep = !g.drinks.length ? cheapest(w, CATEGORIES.drink.members) : 0;
      const nd = nextKind(w, 'drink', g.drinks, g.noDrink.length ? g.noDrink : alive(w)), nm = nextKind(w, 'meal', g.meals, g.noMeal);
      add('a drink for everyone', drinkStep + (g.noDrink.length || !g.drinks.length ? (nd ? goodCost(w, nd) + 1 : 50) : 0));
      add('a meal for everyone', g.noMeal.length ? (nm ? goodCost(w, nm) + 1 : 50) : 0);
      add('seats for everyone', 1 + Math.max(0, p.pop - built(w).reduce((n, b) => n + (bdef(b).seats ?? 0), 0)) / 6);
      add('nobody sulking', 1);
      break;
    }
  }
  return out;
}

// ---------- Charter chains ----------
/** the goods the current charter is waiting on, by its unfinished parts */
function charterGoods(w: World): ResourceId[] {
  const out: ResourceId[] = [];
  const makeable = (r: ResourceId) => suppliable(w, r, 3) || BUILDINGS.some(d => w.owned.includes(d.id) && (d.recipes ?? []).some(x => x.output === r));
  for (const p of partsOf(w)) {
    if (p.kind === 'stock') out.push(...p.resources.filter(r => w.res[r] < p.amount).sort((a, b) => Number(makeable(b)) - Number(makeable(a))).slice(0, 2));
    if (p.kind === 'variety') {
      const have = CATEGORIES[p.category].members.filter(r => w.res[r] >= p.each);
      const rest = CATEGORIES[p.category].members.filter(r => !have.includes(r)).sort((a, b) => Number(makeable(b)) - Number(makeable(a)));
      out.push(...rest.slice(0, Math.max(0, p.kinds - have.length)));
    }
    if (p.kind === 'built' && BUILDING_BY_ID[p.def].cost.fine) out.push('planks');
    if (p.kind === 'allTable' && p.cooked && mealTotal(w) < alive(w).length * 3) out.push(...MEALS.filter(makeable).slice(0, 1));
    if (p.kind === 'monument') { const b = w.buildings.find(x => x.def === p.def); const key = Object.keys(b ? (BUILDING_BY_ID[p.def].stages?.[b.stage ?? 0]?.cost ?? {}) : BUILDING_BY_ID[p.def].cost)[0]; if (key) out.push(...membersOf(key as InputKey).filter(makeable).slice(0, 2)); }
    if (p.kind === 'longTable') {
      // what the feast is missing: a meal and a drink at all, then the kinds that suit the people nothing on hand suits
      const g = feastGaps(w);
      if (!g.meals.length) out.push(...MEALS.filter(makeable).slice(0, 1)); else out.push(...g.meals);
      if (!g.drinks.length) { const d = nextKind(w, 'drink', [], alive(w)); if (d) out.push(d); } else out.push(...g.drinks);
      const nd = g.noDrink.length ? nextKind(w, 'drink', g.drinks, g.noDrink) : undefined; if (nd) out.push(nd);
      const nm = g.noMeal.length ? nextKind(w, 'meal', g.meals, g.noMeal) : undefined; if (nm) out.push(nm);
    }
  }
  return [...new Set(out)];
}
/** buildings (owned, on this map) that make a good, best recipe first, and the ones that feed them, gatherers first */
function chainFor(w: World, goods: ResourceId[]): string[] {
  const out: string[] = [];
  const visit = (r: ResourceId, depth: number) => {
    if (depth < 0 || ['wood', 'berries'].includes(r)) return;
    const makers = BUILDINGS.filter(d => w.owned.includes(d.id) && siteOk(w, d) && (d.recipes ?? []).some(x => x.output === r))
      .map(d => ({ d, rec: (d.recipes ?? []).filter(x => x.output === r).sort((a, b) => b.stars - a.stars)[0] }))
      .filter(x => Object.keys(x.rec.inputs).every(k => membersOf(k as InputKey).some(m => suppliable(w, m, 3) || ['wood', 'berries'].includes(m))))
      .sort((a, b) => b.rec.stars - a.rec.stars);
    const m = makers[0]; if (!m) return;
    for (const k of Object.keys(m.rec.inputs)) { const ms = membersOf(k as InputKey); const pick = ms.find(x => w.res[x] >= 1) ?? ms.find(x => suppliable(w, x, 3)); if (pick) visit(pick, depth - 1); }
    if (!out.includes(m.d.id)) out.push(m.d.id);
  };
  for (const g of goods) visit(g, 3);
  return out;
}
/** the staffing kind a building belongs to ("rawFood" for a forager, "drinks" for a brewery) */
const kindFor = (id: string) => (['forager', 'dock', 'cellar', 'orchard'].includes(id) ? 'rawFood' : id === 'carpenter' ? 'sawmill' : id);
/** the chain the current charter needs, cached per hour */
const chains = new WeakMap<World, { hour: number; ids: string[] }>();
export function charterChain(w: World): string[] {
  if (!w.charter) return [];
  const c = chains.get(w); if (c && c.hour === Math.floor(w.hour)) return c.ids;
  const ids = chainFor(w, charterGoods(w));
  chains.set(w, { hour: Math.floor(w.hour), ids });
  return ids;
}

/** experiment switches for the balance tools */
/**
 * Experiment switches for the balance tools. `advisor` makes the bot play from what's on screen (the complaint
 * panel) instead of its own rules; it's off by default because, so far, it plays worse (see the project doc).
 */
export const BOT = { rateStaffing: false, unlockChain: true, ruleGap: true, hallMood: true, varietyRules: true, bankDrinks: true, bankHall: false, chainBeforeWinter: true, effortPick: true, moodFestival: true, festival: true, festivalAt: 8, comfortsFirst: false, recruitCap: 0, recruitExtra: 4, comforts: true, foodDepot: 'food' as false | 'food' | 'meals', laborersPer: 3.5, advisor: false, gate: true, ranked: true, comfort: 'strict' as 'strict' | 'econ' | 'none', rescue: false, rescueAt: 40, moodBlock: false, reroll: true, variety: false, routes: false, off: [] as string[], skip: [] as string[] };

// ---------- Explaining the bot ----------
/** one thing the bot decided and why: each option with its score broken into parts, or a staffing or build step */
export interface BotNote {
  day: number; hour: number; kind: 'decision' | 'staff' | 'build';
  title: string;
  options?: { id: string; score: number; parts: Record<string, number> }[];
  chosen?: string;
  /** "higher" or "lower" score wins */
  better?: 'higher' | 'lower';
  lines?: string[];
}
/** switch on to record why the bot does what it does (tools/explain.ts); off in normal play and the harness */
export const TRACE = { on: false, notes: [] as BotNote[] };
function note(w: World, n: Omit<BotNote, 'day' | 'hour'>) { if (TRACE.on) TRACE.notes.push({ ...n, day: Math.floor(w.hour / 24) + 1, hour: Math.round(hourOfDay(w)) }); }
const sumParts = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);
const depots = new WeakMap<World, number>();
/** what the bot read off the screen this hour; it plays from this rather than from hidden state */
const advice = new WeakMap<World, { hour: number; concerns: Concern[] }>();
export function concernsOf(w: World): Concern[] {
  const a = advice.get(w);
  if (a && a.hour === Math.floor(w.hour)) return a.concerns;
  const concerns = BOT.advisor ? assess(w) : [];
  advice.set(w, { hour: Math.floor(w.hour), concerns });
  return concerns;
}
/** survival problems get fixed at once; comfort fixes wait until food and wood are comfortable, like a player who keeps the lights on first */
const SURVIVAL = ['hungry', 'cold', 'winter', 'coldhomes', 'wood', 'sick', 'beds', 'storage', 'idle-', 'foodflow', 'woodflow', 'slack'];
const comfortable = (w: World) => BOT.comfort === 'none' || (foodTotal(w) >= alive(w).length * 4 && w.res.wood >= 25 && (BOT.comfort === 'econ' || !concernsOf(w).some(c => c.id === 'stretched')))
  // when people are about to walk out, their complaints come first, whatever it costs
  || (BOT.rescue && (avgMood(w) < BOT.rescueAt || alive(w).some(c => c.sulking)));
/** the concerns the bot is acting on this hour: the top few, with comfort ones waiting for a healthy economy */
export const actedConcerns = (w: World, top = 4) => concernsOf(w)
  .filter(c => !BOT.skip.some(k => c.id.startsWith(k)))
  .filter(c => !BOT.gate || SURVIVAL.some(k => c.id.startsWith(k)) || comfortable(w))
  .slice(0, top);
const fixesOf = (w: World, top = 4) => actedConcerns(w, top).flatMap(c => c.fixes).filter(f => !BOT.off.includes(Object.keys(f)[0]));

/** how far along a charter would already be if picked now, 0..1 */
function progressIf(w: World, id: string) {
  const saved = { charter: w.charter, holds: w.charterHolds, log: w.moodLog };
  w.charter = id; w.charterHolds = []; w.moodLog = [];
  const r = charterProgress(w)?.ratio ?? 0;
  w.charter = saved.charter; w.charterHolds = saved.holds; w.moodLog = saved.log;
  return r;
}
const charterKind = (w: World) => charterDef(w.charter)?.metric.kind;
const day = (w: World) => Math.floor(w.hour / 24) + 1;

export function autoDecide(w: World, style: 'greedy' | 'random' = 'greedy', rand = Math.random) {
  while (w.decisions.length) {
    const d = w.decisions[0];
    let option = 0;
    if (d.kind === 'errand') {
      // send a healthy laborer, or the best-skilled person if the job uses a skill
      const e = w.errands.find(x => x.id === d.errandId);
      const pool = alive(w).filter(c => !c.illness && c.errand == null);
      const best = pool.sort((a, b) => (e?.skill ? b.skills[e.skill] - a.skills[e.skill] : 0) + (Number(a.job != null) - Number(b.job != null)) * 2)[0];
      option = style === 'random' && rand() < 0.3 ? 0 : best?.id ?? 0;
    } else if (d.kind === 'research') {
      option = style === 'random' ? Math.floor(rand() * d.options.length) : d.options.map(id => researchScore(w, id)).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
      if (TRACE.on) note(w, { kind: 'decision', title: 'Research pick', better: 'higher', chosen: d.options[option], options: d.options.map(id => ({ id, parts: researchParts(w, id), score: researchScore(w, id) })) });
    } else if (style === 'random') {
      const n = d.kind === 'event' ? 2 : d.kind === 'recruit' ? 3 : d.options.length;
      option = Math.floor(rand() * n);
    } else if (d.kind === 'charter') {
      // prefer charters we're already close to; long mood holds are a gamble
      // the charter with the least left to do: each condition's gap, and the buildings and drafts its goods still need
      const scoreParts = (id: string): Record<string, number> => (BOT.effortPick ? charterEffort(w, id) : { 'progress already (×−3)': -progressIf(w, id) * 3 });
      const score = (id: string) => sumParts(scoreParts(id));
      option = d.options.map(score).reduce((b, s, i, arr) => (s < arr[b] ? i : b), 0);
      if (TRACE.on) note(w, { kind: 'decision', title: `Charter pick (tier ${d.tier})`, better: 'lower', chosen: d.options[option], options: d.options.map(id => ({ id, parts: scoreParts(id), score: score(id) })) });
    } else if (d.kind === 'blueprint') {
      const helpers = charterHelpers(w.charter);
      const feedable = (id: string) => id !== 'smokehouse' || w.owned.includes('dock');
      // a blueprint that needs planks is dead weight until there's a sawmill; a tavern without a brewery serves nothing
      const usableParts = (id: string): Record<string, number> => ({
        'needs planks, nothing makes them': BUILDING_BY_ID[id].cost.fine && !FINE_MAKERS.some(f => w.owned.includes(f) && usableHere(w, f)) && !FINE_MAKERS.includes(id) ? 6 : 0,
        'tavern with no drink maker': id === 'tavern' && !DRINK_MAKERS.some(d => w.owned.includes(d)) ? 3 : 0,
        // a gatherer is worth more once something owned turns its harvest into a drink; a drink maker is worth more when its best recipe can be fed here
        'feeds a workshop we own': -(BUILDING_BY_ID[id].needs && (BUILDING_BY_ID[id].recipes ?? []).some(r => w.owned.some(d => (BUILDING_BY_ID[d].recipes ?? []).some(x => Object.keys(x.inputs).includes(r.output)))) ? 6 : 0),
        // a workshop nothing owned can feed yet (a kiln before a clay pit) waits behind the rest
        'nothing owned can feed it': BUILDING_BY_ID[id].recipes && !usableHere(w, id) ? 5 : 0,
        'drink maker that can be fed': -drinkFed(id),
      });
      const drinkFed = (id: string) => (DRINK_MAKERS.includes(id) && (BUILDING_BY_ID[id].recipes ?? []).filter(r => r.stars >= 2).some(r => Object.keys(r.inputs).every(k => gatherersOf(w, k).length || BUILDINGS.some(d => d.draftable && siteOk(w, d) && (d.recipes ?? []).some(x => x.output === k)))) ? 2 : 0);
      const asked = fixesOf(w, 3).filter((f): f is { draft: string } => 'draft' in f).map(f => f.draft);
      const usable = (id: string) => sumParts(usableParts(id));
      const rankParts = (id: string): Record<string, number> => ({
        'helps the charter': helpers.includes(id) && feedable(id) ? -100 + helpers.indexOf(id) : 0,
        'a note asks for it': asked.includes(id) ? -50 + asked.indexOf(id) : 0,
        'standing priority': BLUEPRINT_PRIORITY.indexOf(id),
        ...usableParts(id),
        ...(BOT.routes ? { 'new kinds it unlocks (×3)': -newKinds(w, id) * 3 } : {}),
      });
      const rank = (id: string) => (helpers.includes(id) && feedable(id) ? -100 + helpers.indexOf(id) : 0) + (asked.includes(id) ? -50 + asked.indexOf(id) : 0) + BLUEPRINT_PRIORITY.indexOf(id) + usable(id);
      // nothing on offer the colony is missing and wants: pay for a reroll while wood stays comfortable
      const core = ['sawmill', 'tavern', 'cottage', 'pieoven', 'stage', 'bathhouse', 'dock', ...(DRINK_MAKERS.some(x => w.owned.includes(x)) ? [] : DRINK_MAKERS)];
      const wanted = (id: string) => (helpers.includes(id) && feedable(id)) || asked.includes(id) || (core.includes(id) && usable(id) < 6);
      if (BOT.reroll && !d.options.some(wanted) && w.res.wood >= rerollCost(w) + 40) {
        const offered = d.options.join(', ');
        if (!apply(w, { type: 'reroll' })) { note(w, { kind: 'decision', title: 'Blueprint reroll', lines: [`nothing wanted in ${offered}; wood ${Math.floor(w.res.wood)} covers the ${rerollCost(w) - 10} reroll`] }); continue; }
      }
      // routes: credit for each new kind of meal, drink or fine material the blueprint makes feedable right away
      const rank2 = (id: string) => rank(id) - (BOT.routes ? newKinds(w, id) * 3 : 0);
      option = d.options.map(rank2).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
      if (TRACE.on) note(w, { kind: 'decision', title: 'Blueprint pick', better: 'lower', chosen: d.options[option], options: d.options.map(id => ({ id, parts: rankParts(id), score: rank2(id) })) });
    } else if (d.kind === 'perk') {
      option = d.options.map(o => PERK_PRIORITY.indexOf(o)).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
      if (TRACE.on) note(w, { kind: 'decision', title: 'Boon pick', better: 'lower', chosen: d.options[option], options: d.options.map(id => ({ id, parts: { 'standing priority': PERK_PRIORITY.indexOf(id) }, score: PERK_PRIORITY.indexOf(id) })) });
    } else if (d.kind === 'recruit') {
      const score = (c: typeof d.options[number]) => (c.traits.includes('sunny') ? 2 : 0) + (c.traits.includes('diligent') ? 1 : 0)
        - (c.traits.includes('grumbler') ? 2 : 0) - (c.traits.includes('drama') ? 1 : 0) - (c.traits.includes('vain') ? 1 : 0);
      const bestI = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
      const kind = charterKind(w);
      // charters ask for a population as one of their parts
      const popPart = partsOf(w).map(p => (p.kind === 'population' ? p.amount : p.kind === 'longTable' ? p.pop : 0)).reduce((a, b) => Math.max(a, b), 0);
      const wantsPeople = kind === 'population' || (popPart > 0 && alive(w).length < popPart + 1);
      // mood charters: every settler past 8 adds strain, so take only as many as the charter needs
      const m = charterDef(w.charter)?.metric as { pop?: number } | undefined;
      const cap = BOT.recruitCap || (popPart ? Math.max(popPart + BOT.recruitExtra, 8) : 12);
      // only take on mouths the larder can feed
      const raw = rawStock(w) + mealTotal(w);
      const ws = winterStores(w);
      const fed = raw > alive(w).length * 3 && (ws.food === 0 || raw >= ws.food * 0.9);
      const ok = alive(w).length < cap && alive(w).length < beds(w) + 2 && (wantsPeople || avgMood(w) > 40) && fed;
      option = ok ? bestI : 99;
      if (TRACE.on) {
        const tp = (c: typeof d.options[number]) => Object.fromEntries(c.traits.filter(t => ['sunny', 'diligent', 'grumbler', 'drama', 'vain'].includes(t)).map(t => [t, t === 'sunny' ? 2 : t === 'diligent' ? 1 : t === 'grumbler' ? -2 : -1]));
        const checks = [`colonists ${alive(w).length} < cap ${cap}: ${alive(w).length < cap ? 'yes' : 'no'}`, `beds ${beds(w)} + 2 > colonists: ${alive(w).length < beds(w) + 2 ? 'yes' : 'no'}`, `charter wants people or mood ${Math.round(avgMood(w))} > 40: ${wantsPeople || avgMood(w) > 40 ? 'yes' : 'no'}`, `food ${Math.floor(raw)} > 3 per colonist: ${fed ? 'yes' : 'no'}`];
        note(w, { kind: 'decision', title: 'Recruit', better: 'higher', chosen: ok ? d.options[bestI].name : 'sent them all away', lines: checks, options: d.options.map(c => ({ id: c.name, parts: tp(c), score: score(c) })) });
      }
    } else if (d.kind === 'event') {
      const ev = EVENTS.find(e => e.id === d.eventId)!;
      option = canPay(w, ev.options[0].effect) ? 0 : 1;
      if (TRACE.on) note(w, { kind: 'decision', title: `Event: ${ev.title}`, chosen: ev.options[option].label, lines: [`can pay for "${ev.options[0].label}": ${option === 0 ? 'yes' : 'no'}`] });
    }
    apply(w, { type: 'resolve', option });
  }
}

function canPay(w: World, effect: string) {
  const food = rawStock(w) + mealTotal(w);
  switch (effect) {
    case 'payFood20': return food > 60;
    case 'bardPlay': return drinkTotal(w) >= 6;
    case 'pigeonBribe': return w.res.berries >= 15;
    case 'wedding': return mealTotal(w) >= 8 && drinkTotal(w) >= 5;
    case 'outhouseFix': return w.res.planks >= 10;
    case 'peddlerPlanks': return w.res.wood >= 50;
    // strain trades: worth it once strain bites, if the larder or woodpile can spare it
    case 'lettersRead': return edibleTotal(w) >= 15 + alive(w).length * 2;
    case 'bonfire': return w.res.wood >= 40;
    case 'moonDance': return mealTotal(w) >= alive(w).length * 2 && w.strain >= 5;
    default: return true;
  }
}

/** Lay out blueprints the colony can afford, at most two construction sites at a time. Called hourly. */
// ---------- Staffing by need ----------
// Food and wood are staffed from what the colony actually uses and what a worker actually brings in, read off the
// ledger, not from thresholds: (daily use + a refill toward a target stock over a couple of days) / output per worker.
// Off by default (BOT.rateStaffing): over 100 runs it kept colonies safer (18% collapse against 28%) but held so many
// hands on food and wood that charters crawled (21% wins at day 81 against 33% at day 59). The thresholds it replaces
// let stocks run thin, which frees people for the charter. Worth another look once layouts cut gatherers' walking.
const RAW_MAKERS = ['forager', 'dock', 'cellar', 'orchard'];
interface EconMemory { day: number; woodUse: number[]; rawUse: number[]; staff: { wood: number; raw: number }[] }
const econMemory = new WeakMap<World, EconMemory>();
const sumKeys = (ld: Record<string, number>, test: (good: string, src: string) => boolean) =>
  Object.entries(ld).reduce((n, [k, v]) => { const [g, s] = k.split(':'); return s && test(g, s) ? n + v : n; }, 0);
/** once an hour: who works the food and wood jobs, and at each dawn yesterday's use */
function rememberEconomy(w: World) {
  const m = econMemory.get(w) ?? { day: 0, woodUse: [], rawUse: [], staff: [] };
  econMemory.set(w, m);
  const at = (ids: string[]) => alive(w).filter(c => { const j = buildingByUid(w, c.job); return !!j && ids.includes(j.def); }).length;
  m.staff.push({ wood: at(['woodcutter']), raw: at(RAW_MAKERS) }); if (m.staff.length > 24) m.staff.shift();
  if (day(w) !== m.day) {
    m.day = day(w);
    const ld = lastDay(w), scale = 24 / lastDayHours(w);
    m.woodUse.push(sumKeys(ld, (g, s) => g === 'wood' && s.startsWith('-')) * scale); if (m.woodUse.length > 3) m.woodUse.shift();
    m.rawUse.push(sumKeys(ld, (g, s) => RAW_FOODS.includes(g as ResourceId) && s.startsWith('-')) * scale); if (m.rawUse.length > 3) m.rawUse.shift();
  }
}
/** workers wanted on wood and on raw food, and why (for explaining) */
export function staffByNeed(w: World): { woodcutter: number; rawFood: number; why: string } {
  const m = econMemory.get(w);
  const pop = alive(w).length, ws = winterStores(w), ld = lastDay(w), scale = 24 / lastDayHours(w);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const staffAvg = (k: 'wood' | 'raw') => avg((m?.staff ?? []).map(x => x[k]));
  // what one worker brings in a day, from the last day's output, or a modest guess before there's any to go on
  const perWorker = (made: number, k: 'wood' | 'raw', guess: number) => ((m?.staff.length ?? 0) >= 12 && staffAvg(k) >= 0.5 ? Math.max(guess * 0.4, made * scale / staffAvg(k)) : guess);
  // wood: today's use or the last few days' (construction comes in lumps), plus what open building sites still need
  const woodUse = Math.max(sumKeys(ld, (g, s) => g === 'wood' && s.startsWith('-')) * scale, avg(m?.woodUse ?? []), 4);
  const siteWood = sites(w).reduce((n, b) => n + (remainingCost(b).wood ?? 0), 0);
  const woodTarget = Math.max(30, ws.wood) + siteWood;
  const woodRefill = Math.max(-woodUse * 0.5, (woodTarget - w.res.wood) / 2);
  const woodPer = perWorker(sumKeys(ld, (g, s) => g === 'wood' && s === '+woodcutter'), 'wood', 6);
  const woodcutter = Math.max(1, Math.ceil((woodUse + woodRefill) / woodPer));
  // raw food: eaten, cooked and spoiled; the target covers a few days for everyone and what winter wants put by
  const rawUse = Math.max(sumKeys(ld, (g, s) => RAW_FOODS.includes(g as ResourceId) && s.startsWith('-')) * scale, avg(m?.rawUse ?? []), pop * 1.2);
  const rawTarget = Math.max(pop * 3, ws.food - mealTotal(w));
  const rawRefill = Math.max(-rawUse * 0.5, (rawTarget - rawStock(w)) / 2);
  const rawPer = perWorker(sumKeys(ld, (g, s) => RAW_FOODS.includes(g as ResourceId) && RAW_MAKERS.some(r => s === `+${r}`)), 'raw', 7);
  const rawFood = Math.max(1, Math.ceil((rawUse + rawRefill) / rawPer));
  return { woodcutter, rawFood, why: `wood: use ${woodUse.toFixed(0)}/day, stock ${Math.floor(w.res.wood)} of ${Math.round(woodTarget)}, ${woodPer.toFixed(1)} per worker → ${woodcutter} · raw food: use ${rawUse.toFixed(0)}/day, stock ${Math.floor(rawStock(w))} of ${Math.round(rawTarget)}, ${rawPer.toFixed(1)} per worker → ${rawFood}` };
}

export function autoBuild(w: World) {
  rememberEconomy(w);
  const kind = charterKind(w);
  const hallSite = w.buildings.find(b => b.def === 'hall' && !b.built && (b.stage ?? 0) === 0);
  const saving: ResourceId[] = hallSite ? ['planks'] : w.charter === 'firstplanks' ? ['wood', 'planks'] : [];
  const pop = alive(w).length;
  const count = (id: string) => w.buildings.filter(b => b.def === id).length;
  // running low on food opens an extra site, so a new forager never waits behind flowerbeds
  const maxSites = 2 + (foodTotal(w) < pop * 4 ? 1 : 0);
  if (sites(w).length < maxSites) {
    const want: string[] = [];
    // wood is the economy: keep about one woodcutter per three settlers, more while short

    const pendingBeds = sites(w).reduce((n, b) => n + (BUILDING_BY_ID[b.def].beds ?? 0), 0);
    // a research desk early, so the study of kitchens and dining halls can start
    if (w.research && w.owned.includes('desk') && count('desk') === 0 && researchLeft(w).length) want.push('desk');
    if (beds(w) + pendingBeds < pop + 1) want.push(w.owned.includes('cottage') && stockOf(w, 'fine') >= 10 && !saving.includes('planks') ? 'cottage' : 'leanto');
    // what people are complaining about comes next, biggest complaint first
    for (const f of fixesOf(w)) if ('build' in f && f.build && w.owned.includes(f.build) && !want.includes(f.build)) want.push(f.build);
    // whatever the charter's supply chain is missing, gatherers first
    for (const id of [...charterChain(w)].reverse()) if (count(id) === 0) want.unshift(id);
    // a monument charter: lay the Hall out early so materials can trickle in
    for (const p of partsOf(w)) if (p.kind === 'monument' && w.owned.includes(p.def) && count(p.def) === 0) want.unshift(p.def);
    // the Long Table needs a seat for everyone
    if (partsOf(w).some(p => p.kind === 'longTable') && count('dining') < Math.ceil((pop + 1) / 6)) want.push('dining');
    if (count('dining') < Math.ceil(pop / 6)) want.push('dining');
    if (count('kitchen') === 0) want.push('kitchen');
    if (count('clinic') === 0 && (day(w) >= 4 || alive(w).some(c => c.illness))) want.push('clinic');
    for (const id of charterHelpers(w.charter)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    for (const id of BLUEPRINT_PRIORITY.slice(0, 2)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    if (count('storehouse') === 0 && day(w) >= 3) want.push('storehouse');
    if (moodCharter(w) || ((!BOT.advisor || BOT.moodBlock) && avgMood(w) < 45)) {
      for (const id of MOOD_BUILDINGS) if (w.owned.includes(id) && count(id) === 0) want.push(id);
      const spare = w.res.wood > 45;
      if (count('flowerbed') < 6 && spare) want.push('flowerbed');
      if (count('statue') < 2 && !saving.includes('planks') && stockOf(w, 'fine') > 30) want.push('statue');
      if (count('lantern') < 3 && spare) want.push('lantern');
      // swap drafty shacks for cottages when planks allow
      if (w.owned.includes('cottage') && count('cottage') < Math.ceil(pop / 2) && stockOf(w, 'fine') >= 14) want.unshift('cottage');
    }
    // one of everything owned, except site gatherers nothing is waiting on yet
    const waitedOn = staffWants(w).drinks > 0 || staffWants(w).sawmill > 0 ? neededGatherers(w) : [];
    // a small colony can't afford one of everything; only when wood is comfortable, and helpers first
    const spareWood = w.res.wood >= 60;
    for (const id of BLUEPRINT_PRIORITY.slice(2)) if (w.owned.includes(id) && count(id) === 0 && (!BUILDING_BY_ID[id].needs || id === 'dock' || waitedOn.includes(id)) && (spareWood || charterHelpers(w.charter).includes(id))) want.push(id);
    // only add producers when the colony wants more workers there than it has slots for
    const short = staffShortfall(w);
    if (short.includes('woodcutter')) want.unshift('woodcutter');
    if (short.includes('rawFood')) {
      const hut = w.owned.includes('dock') && count('dock') === 0 ? 'dock' : 'forager';
      if (foodTotal(w) < pop * 5) want.unshift(hut); else want.push(hut);
    }
    if (short.includes('kitchen')) want.push('kitchen');
    for (const k of ['sawmill', 'pieoven', 'kiln']) if (short.includes(k) && w.owned.includes(k)) want.push(k);
    if (short.includes('drinks')) { const d = DRINK_MAKERS.find(x => w.owned.includes(x) && count(x) === 0) ?? DRINK_MAKERS.find(x => w.owned.includes(x)); if (d) want.push(d); }
    // the orchard, field or apiary a built workshop's best recipe is waiting on
    const sw = staffWants(w);
    if (['drinks', 'kiln', 'sawmill', 'bakery', 'mill', 'apothecary'].some(k => (sw[k] ?? 0) > 0)) for (const g of neededGatherers(w)) if (w.owned.includes(g) && count(g) === 0) want.push(g);
    if (count('storehouse') === 0) want.push('storehouse');
    // winter stores need somewhere to go
    const ws = winterStores(w);
    const room = storageCap(w) - stored(w) - sites(w).reduce((n, b) => n + (bdef(b).storage ?? 0), 0);
    if (ws.food + ws.wood > 0 && room < Math.max(0, ws.food - foodTotal(w)) + Math.max(0, ws.wood - w.res.wood) + 20) want.unshift(w.owned.includes('storehouse') ? 'storehouse' : 'stockpile');
    // more room when one kind of good runs out of space
    if (storageFree(w, 'wood') < 30 && storages(w).length > 0) want.unshift('stockpile');
    if (count('storehouse') > 0 && storageFree(w, 'berries') < 30) want.unshift(count('storehouse') < 2 ? 'storehouse' : 'stockpile');
    // while the charter's chain is missing a building, wood goes to that chain and to beds and food first
    // (one that needs planks with no way to get them doesn't hold everything else up: nothing would ever be built)
    const noFine = (id: string) => (BUILDING_BY_ID[id].cost.fine ?? 0) > stockOf(w, 'fine') && !w.buildings.some(b => FINE_MAKERS.includes(b.def)) && !FINE_MAKERS.some(m => w.owned.includes(m));
    const missing = charterChain(w).filter(id => count(id) === 0 && !(BOT.unlockChain && noFine(id)));
    const firstNeeds = ['leanto', 'woodcutter', 'forager', 'dock', ...(count('kitchen') ? [] : ['kitchen']), ...(count('dining') ? [] : ['dining'])];
    // a chain building that needs planks can't go up without something that makes them: that maker unlocks the chain
    const chainNeedsFine = missing.some(id => (BUILDING_BY_ID[id].cost.fine ?? 0) > stockOf(w, 'fine')) && !w.buildings.some(b => FINE_MAKERS.includes(b.def));
    if (BOT.unlockChain && chainNeedsFine) firstNeeds.push(...FINE_MAKERS);
    const skipped: string[] = [];
    const skip = (id: string, why: string) => { if (TRACE.on && !skipped.some(x => x.startsWith(id + ':'))) skipped.push(`${id}: ${why}`); };
    for (const id of want) {
      if (sites(w).some(b => b.def === id)) { skip(id, 'already under construction'); continue; }
      // blueprints still behind research (or never drafted) can't be placed
      if (!w.owned.includes(id)) { skip(id, 'not unlocked or drafted'); continue; }
      if (missing.length && !missing.includes(id) && !firstNeeds.includes(id) && !(id === 'stockpile' && storageFree(w, 'wood') < 15)) { skip(id, `waiting: wood goes to the charter's chain first (${missing.join(', ')})`); continue; }
      const def = BUILDING_BY_ID[id];
      if (id === 'smokehouse' && !w.buildings.some(b => b.def === 'dock')) { skip(id, 'no dock to feed it'); continue; }
      if (def.recipes && !usableHere(w, id)) { skip(id, 'nothing owned can feed it'); continue; }
      if (id === 'pieoven' && !w.buildings.some(b => FINE_MAKERS.includes(b.def)) && stockOf(w, 'fine') < 8) { skip(id, 'no planks or plank maker'); continue; }
      // while saving a resource, only spend it on beds and on producers that make more of it
      // beds, food, the first kitchen, dining hall and clinic are never held back to save for a charter
      const essential = id === 'leanto' || id === 'hall' || id === 'woodcutter' || id === 'forager' || (['kitchen', 'dining', 'clinic'].includes(id) && count(id) === 0) || (saving.includes('planks') && ['sawmill', 'kiln', 'claypit'].includes(id));
      const short = !def.stages && Object.entries(def.cost).some(([r, n]) => stockOf(w, r as InputKey) < (n ?? 0) + (r === 'wood' ? 10 : 0) || (saving.some(x => membersOf(r as InputKey).includes(x)) && !essential));
      if (short) { skip(id, `can\u2019t afford ${Object.entries(def.cost).map(([r, n]) => `${n} ${r}`).join(', ')}${saving.length ? ` while saving ${saving.join(' and ')}` : ''} (have ${Math.floor(w.res.wood)} wood, ${Math.floor(stockOf(w, 'fine'))} planks or bricks)`); continue; }
      // decorations go by the hearth; storage next to what it serves; everything else near the centre
      const near = storageSpot(w, id);
      const spot = findSpot(w, id, near.x, near.y, !def.decor);
      if (!spot) { skip(id, 'no room on the map'); continue; }
      apply(w, { type: 'place', def: id, x: spot.x, y: spot.y });
      if (TRACE.on) note(w, { kind: 'build', title: `Placed a ${BUILDING_BY_ID[id].name.toLowerCase()}`, lines: [`wanted, in order: ${[...new Set(want)].slice(0, 10).join(', ')}`, ...skipped.slice(0, 6).map(x => `skipped ${x}`)] });
      skipped.length = 0;
      break;
    }
    if (TRACE.on && skipped.length && Math.round(hourOfDay(w)) === 12) note(w, { kind: 'build', title: 'Nothing placed at noon', lines: [`wanted, in order: ${[...new Set(want)].slice(0, 10).join(', ')}`, ...skipped.slice(0, 8).map(x => `skipped ${x}`)] });
  }
  // lay paths from each doorway towards the hearth: right away for path charters, otherwise once wood is comfortable
  const planned = w.paths.filter(p => p === 1).length;
  if (w.res.wood > 60 && Math.round(w.hour) % 24 === 9) {
    for (const b of built(w)) {
      if (bdef(b).decor || bdef(b).walkable || b.def === 'hearth') continue;
      let { x, y } = doorTile(b.def, b.x, b.y, b.rot);
      for (let i = 0; i < 12 && Math.hypot(x - CENTER, y - CENTER) > 2.5; i++) {
        if (terrainAt(w, x, y) !== T_WATER && pathAt(w, x, y) === 0) apply(w, { type: 'path', x, y, on: true });
        if (Math.abs(x - CENTER) > Math.abs(y - CENTER)) x += Math.sign(CENTER - x); else y += Math.sign(CENTER - y);
      }
    }
  }
  // experiment: a small high-priority food pile between the kitchen and the dining hall
  if (BOT.foodDepot && !w.buildings.some(b => b.uid === depots.get(w)) && built(w).some(b => b.def === 'storehouse') && built(w).some(b => b.def === 'dining')) {
    const near = centroid(w, ['dining', 'kitchen']);
    const spot = findSpot(w, 'stockpile', near.x, near.y, true);
    if (spot && !apply(w, { type: 'place', def: 'stockpile', x: spot.x, y: spot.y })) depots.set(w, w.buildings[w.buildings.length - 1].uid);
  }
  // a festival when strain is biting and the larder can spare it; it holds off while a charter is counting the meals
  if (BOT.festival && !w.festival?.called && hourOfDay(w) < 17) {
    const p = festivalPreview(w);
    const countingMeals = partsOf(w).some(m => (m.kind === 'stock' && m.resources.some(r => MEALS.includes(r))) || (m.kind === 'variety' && m.category === 'meal') || m.kind === 'monument' || m.kind === 'longTable');
    const spare = mealTotal(w) >= alive(w).length * (countingMeals ? 3 : 1.5);
    // a charter whose only missing piece is the 24-hour mood: a festival lifts everyone for a day and a half
    const moodPart = partsOf(w).find(m => m.kind === 'avgMood') as { amount: number } | undefined;
    const log = w.moodLog ?? [];
    const avg24 = log.length ? log.reduce((a, b) => a + b, 0) / log.length : avgMood(w);
    const label = charterProgress(w)?.label ?? '';
    const onlyMood = !!moodPart && avg24 < moodPart.amount && avg24 >= moodPart.amount - 8 && label.split(' · ').filter(x => !x.startsWith('✓')).length === 1;
    // the harvest home: one festival every autumn, late enough that the stores are mostly in
    const s = seasonOf(w);
    const harvest = s.season === 'autumn' && s.dayOf >= 5 && (w.festival?.at ?? -1e9) < w.hour - s.dayOf * 24;
    if (harvest && !p.wait && p.fed >= p.guests * 0.8) {
      if (!apply(w, { type: 'callFestival' })) note(w, { kind: 'decision', title: 'Harvest festival called', lines: [`autumn day ${s.dayOf}, none held yet this autumn; ${Math.floor(mealTotal(w))} meals for ${alive(w).length}`] });
    } else if (!p.wait && p.fed === p.guests && ((w.strain >= BOT.festivalAt && (spare || w.strain >= BOT.festivalAt * 2)) || (BOT.moodFestival && onlyMood && mealTotal(w) >= alive(w).length * 1.2))) {
      if (!apply(w, { type: 'callFestival' })) note(w, { kind: 'decision', title: 'Festival called', lines: [`strain ${Math.round(w.strain)} ≥ ${BOT.festivalAt}; ${Math.floor(mealTotal(w))} meals for ${alive(w).length}${countingMeals ? ' (the charter counts meals, so it keeps 3 each)' : ''}; eases about ${Math.round(p.relief)}`] });
    }
  }
  // the Long Table: call the feast once everyone would come, sit and get something they like
  if (partsOf(w).some(p => p.kind === 'longTable') && !w.feast?.called && w.hour >= (w.feast?.readyAt ?? 0) && hourOfDay(w) < 17 && feastCheck(w).ok) apply(w, { type: 'callFeast' });
  autoStorage(w);
  if (Math.round(hourOfDay(w)) % 3 === 0) autoStaff(w);
  autoFoodRules(w);
  void MAP_SIZE;
}


// ---------- Staffing ----------
/** What the colony wants, in workers per kind of building, before counting how many people it has. */
export function staffWants(w: World): Record<string, number> {
  const pop = alive(w).filter(c => !bedridden(c)).length;
  const ch = w.charter ?? '';
  const raw = rawStock(w);
  // stores for the coming winter
  const ws = winterStores(w);
  const need = BOT.rateStaffing ? staffByNeed(w) : null;
  // a second meal route once food and wood are comfortable: one cook on the first pie oven, smokehouse or bakery that can be fed
  const comfy = foodTotal(w) >= pop * 4 && w.res.wood >= 25;
  const second = BOT.variety && comfy ? ['pieoven', 'smokehouse', 'bakery'].find(id => built(w).some(b => b.def === id && plannedRecipe(w, b) && MEALS.includes(plannedRecipe(w, b)!.output))) : undefined;
  const hall = w.buildings.find(b => b.def === 'hall' && !b.built);
  const charterDrinks = (ch === 'roof' && drinkTotal(w) < 18) || ch === 'tasting' || (hall && (hall.stage ?? 0) >= 1) || (ch === 'longtable' && drinkTotal(w) < pop * 1.5);
  // a finale that serves drinks needs them banked: the tavern shuts while they build up, and the brewers get more hands
  const bank = BOT.bankDrinks ? drinksToBank(w) : 0;
  const drinksWanted = bank > 0 ? 4 : charterDrinks ? 2 : drinkTotal(w) < 15 && built(w).some(b => b.def === 'tavern') ? 1 : 0;
  return {
    woodcutter: need ? need.woodcutter : 1 + Math.floor(pop / 5) + (moodCharter(w) || ch === 'firstplanks' ? 1 : 0) + (w.res.wood < 25 ? 1 : 0) + (w.res.wood < ws.wood ? 1 + Math.floor(pop / 6) : 0),
    rawFood: need ? need.rawFood : rawFoodWorkers(w, pop) + (raw < pop * 4 ? 1 : 0) + (['settled', 'piesky', 'longtable'].includes(ch) ? 1 : 0) + (foodTotal(w) < ws.food ? 1 + Math.floor(pop / 6) : 0),
    kitchen: Math.max(1, Math.ceil(pop / 9)) + (['settled', 'longtable'].includes(ch) || (hall?.stage ?? 0) === 1 ? 1 : 0),
    desk: w.research?.current && desks(w).length ? 1 : 0,
    sawmill: (stockOf(w, 'fine') < planksWanted(w) ? 2 : stockOf(w, 'fine') < 25 ? 1 : 0) + (['firstplanks', 'roof', 'hall'].includes(ch) ? 1 : 0),
    pieoven: ch === 'piesky' ? 2 : ['twokitchens', 'menu', 'longtable'].includes(ch) || second === 'pieoven' ? 1 : 0,
    drinks: drinksWanted,
    // bricks: a kiln works while the colony is short of fine materials and can get clay
    kiln: stockOf(w, 'fine') < planksWanted(w) && plannedUses(w, 'clay') ? 2 : 0,
    claypit: stockOf(w, 'fine') < planksWanted(w) && plannedUses(w, 'clay') ? 2 : 0,
    // a varied table: bread from flour, skewers from herbs, remedies for the clinic
    bakery: built(w).some(b => b.def === 'bakery') && (mealTotal(w) < pop * 3 || ['menu', 'bread', 'twokitchens'].includes(ch) || second === 'bakery') ? 1 + (['menu', 'bread'].includes(ch) ? 1 : 0) : 0,
    mill: built(w).some(b => b.def === 'bakery') && plannedUses(w, 'flour') ? 1 : 0,
    apothecary: built(w).some(b => b.def === 'apothecary') && (alive(w).some(c => c.illness) || stockOf(w, 'remedy') < 6 || ['tasting', 'hearty'].includes(ch)) ? 1 : 0,
    herbgarden: built(w).some(b => b.def === 'apothecary') || ch === 'menu' ? 1 : 0,
    // gatherers for a drink maker's best recipe work as long as the drink makers do
    field: (drinksWanted || built(w).some(b => b.def === 'mill' || b.def === 'bakery')) && plannedUses(w, 'grain') ? 2 : 0,
    apiary: (drinksWanted || ch === 'hearty') && plannedUses(w, 'honey') ? 1 : 0,
    smokehouse: w.res.fish > 20 || ['menu', 'twokitchens', 'woodsmoke'].includes(ch) || second === 'smokehouse' ? 1 + (ch === 'woodsmoke' ? 1 : 0) : 0,
    tavern: built(w).some(b => b.def === 'tavern') && bank <= 0 ? 1 : 0,
    clinic: alive(w).some(c => bedridden(c)) ? 1 : 0,
  };
}
/** drinks still to put by for a finale that serves them (the Long Table, the Hall's topping-out); 0 when there's enough */
export function drinksToBank(w: World) {
  const pop = alive(w).length;
  if (w.charter === 'longtable') return Math.max(0, pop + 2 - drinkTotal(w));
  const hall = w.buildings.find(b => b.def === 'hall' && !b.built);
  if (BOT.bankHall && w.charter === 'hall' && hall && (hall.stage ?? 0) >= 2) return Math.max(0, 27 - drinkTotal(w));
  return 0;
}
/** fine materials (planks, bricks, wicker) the colony could spend right now: owned blueprints not yet built, plus what sites still need */
function planksWanted(w: World) {
  let n = 0;
  for (const id of w.owned) if (!w.buildings.some(b => b.def === id)) n += BUILDING_BY_ID[id].cost.fine ?? 0;
  for (const b of sites(w)) n += Math.max(0, (BUILDING_BY_ID[b.def].cost.fine ?? 0) - membersOf('fine').reduce((m, r) => m + (b.delivered[r] ?? 0), 0));
  return n;
}
/** foragers and fishers needed to feed everyone, from how productive the existing huts actually are */
function rawFoodWorkers(w: World, pop: number) {
  const huts = built(w).filter(b => ['forager', 'dock', 'cellar'].includes(b.def));
  const perWorker = 12 * (huts.length ? huts.reduce((n, b) => n + (recipeRate(currentRecipe(w, b) ?? bdef(b).recipes![0]) * b.eff), 0) / huts.length : 1.0);
  return Math.max(1, Math.ceil((pop * 2.6) / perWorker));
}

/** How many workers the bot wants in each building right now: essentials first, then the charter, then extras. */
export function staffPlan(w: World, explain = false): Map<number, number> {
  const pop = alive(w).filter(c => !bedridden(c)).length;
  const ch = w.charter ?? '';
  const want = staffWants(w);
  const chain = charterChain(w).map(kindFor);
  for (const k of chain) want[k] = Math.max(want[k] ?? 0, 2);
  // a skeleton crew keeps its jobs going and builds with whoever is left
  const extraHands = fixesOf(w).reduce((n, f) => n + ('laborers' in f ? f.laborers : 0), 0);
  const slack = BOT.advisor && concernsOf(w).some(c => c.id === 'slack') ? 1 : 0;
  const keepFree = Math.max(1, (pop <= 5 ? 1 : Math.max(2, Math.ceil(pop / BOT.laborersPer)) + (sites(w).length > 1 ? 1 : 0)) + Math.min(1, extraHands) - slack);
  let budget = Math.max(0, pop - keepFree);
  const given: Record<string, number> = {};
  const plan = new Map<number, number>();
  const capacity = (kind: string) => built(w).filter(b => defsOf(kind).includes(b.def) && !blockedReason(w, b)).reduce((n, b) => n + bdef(b).slots, 0);
  // for explaining: which step handed out each worker
  let stage = 'essentials'; const steps: string[] = [];
  const give = (kind: string, upTo: number) => {
    const before = given[kind] ?? 0;
    while (budget > 0 && (given[kind] ?? 0) < Math.min(upTo, want[kind] ?? 0, capacity(kind))) { given[kind] = (given[kind] ?? 0) + 1; budget--; }
    if (explain && (given[kind] ?? 0) > before) steps.push(`${stage}: ${kind} +${(given[kind] ?? 0) - before}`);
  };
  const budget0 = budget;
  if (BOT.advisor && BOT.ranked) {
    rankedStaffing(w, want, budget, given, capacity, ch, pop);
  } else {
  // 1. essentials, one each
  // food and wood first: everything else is built from them
  give('rawFood', 1);
  // a small colony studies before it chops, while the woodpile lasts
  if (w.res.wood >= 30) give('desk', 1);
  give('woodcutter', 1); give('desk', 1); give('kitchen', 1);
  stage = 'food and wood top-ups';
  // then what the complaints call for, biggest first
  // (with staffing by need, food and wood already match the colony's use; the foreman's "more woodcutters" doesn't stack on top)
  const serveFixes = () => { for (const f of fixesOf(w)) if ('staff' in f && !(BOT.rateStaffing && ['rawFood', 'woodcutter'].includes(f.staff))) { want[f.staff] = Math.max(want[f.staff] ?? 0, f.n); give(f.staff, f.n); } };
  // comforts already built get a person before the food and wood top-ups take everyone (BOT.comfortsFirst), or after them
  const comforts = () => {
    if (BOT.comforts && built(w).some(b => b.def === 'tavern')) {
      want.drinks = Math.max(want.drinks ?? 0, drinkTotal(w) < 25 ? 1 : 0); want.tavern = Math.max(want.tavern ?? 0, 1);
      give('drinks', 1);
      // the gatherer the drink maker's best recipe waits on (an orchard for cider, a field for ale)
      for (const g of neededGatherers(w)) if (['orchard', 'field', 'apiary'].includes(g)) { want[g] = Math.max(want[g] ?? 0, 1); give(g, 1); }
      give('tavern', 1);
    }
  };
  if (BOT.comfortsFirst) { stage = 'comforts'; comforts(); stage = 'food and wood top-ups'; }
  const ws = winterStores(w);
  if (BOT.rateStaffing) {
    // as many as the colony's actual use calls for (wanted counts already come from staffByNeed)
    give('rawFood', want.rawFood ?? 1); give('woodcutter', want.woodcutter ?? 1);
    if (explain) steps.push(`  need: ${staffByNeed(w).why}`);
  } else {
    if (rawStock(w) < pop * 4 || (!BOT.chainBeforeWinter && foodTotal(w) < ws.food)) give('rawFood', 99);
    if (w.res.wood < 30 || (!BOT.chainBeforeWinter && w.res.wood < ws.wood)) give('woodcutter', Math.max(2, Math.ceil(pop / 4)) + (w.res.wood < ws.wood ? 1 : 0));
  }
  give('clinic', 1);
  // the charter's chain gets its first hands before the winter stores take the rest
  if (BOT.chainBeforeWinter && !BOT.rateStaffing) {
    stage = 'charter chain';
    for (const k of chain) give(k, 1);
    stage = 'winter stores';
    if (foodTotal(w) < ws.food) give('rawFood', (given.rawFood ?? 0) + 2);
    if (w.res.wood < ws.wood) give('woodcutter', (given.woodcutter ?? 0) + 2);
    stage = 'food and wood top-ups';
  }
  serveFixes();
  // planks unlock every mood building, so the sawmill counts as an essential once there's something to spend them on
  give('sawmill', 1);
  stage = 'charter chain';
  // one worker along the charter's chain, then a second
  for (const k of chain) give(k, 1);
  for (const k of chain) give(k, 2);
  stage = 'comforts'; if (!BOT.comfortsFirst) comforts();
  // a second meal route, so the stew-haters have something: one cook on the best second kitchen that can be fed
  const second = (BOT.variety || BOT.comforts) ? ['pieoven', 'smokehouse', 'bakery'].find(id => built(w).some(b => b.def === id && plannedRecipe(w, b) && MEALS.includes(plannedRecipe(w, b)!.output))) : undefined;
  if (second) { want[second] = Math.max(want[second] ?? 0, 1); give(second, 1); }
  // 2. whatever the charter leans on
  stage = 'charter focus';

  for (const k of FOCUS[ch] ?? []) give(k, 99);
  // 3. everything else, round-robin so no one kind eats the budget
  stage = 'round-robin extras';
  for (let round = 2; round <= 6; round++) for (const k of ['woodcutter', 'rawFood', 'kitchen', 'sawmill', 'kiln', 'claypit', 'tavern', 'drinks', 'field', 'apiary', 'pieoven', 'smokehouse', 'bakery', 'mill', 'apothecary', 'herbgarden']) give(k, round);
  }
  // spread each kind's workers over its buildings, best placed first
  for (const kind of Object.keys(want)) {
    let n = given[kind] ?? 0;
    for (const b of built(w).filter(b => defsOf(kind).includes(b.def) && !blockedReason(w, b)).sort((a, z) => z.eff - a.eff)) {
      const take = Math.min(n, bdef(b).slots); plan.set(b.uid, take); n -= take;
    }
  }
  for (const b of built(w)) if (bdef(b).slots && !plan.has(b.uid)) plan.set(b.uid, 0);
  if (explain) {
    const unmet = Object.entries(want).filter(([k, n]) => n > (given[k] ?? 0)).map(([k, n]) => `${k} wants ${n}, got ${given[k] ?? 0}${capacity(k) <= (given[k] ?? 0) ? (built(w).some(b => defsOf(k).includes(b.def)) ? ' (no free slot, or it can\u2019t run)' : ' (none built)') : budget <= 0 ? ' (no one left)' : ''}`);
    note(w, { kind: 'staff', title: `Staffing: ${pop} able-bodied, ${keepFree} kept as laborers, ${budget0} jobs to hand out`, lines: [...steps, ...(budget > 0 ? [`${budget} left unassigned`] : []), ...(unmet.length ? ['wanted but not staffed: ' + unmet.join('; ')] : [])] });
  }
  return plan;
}

/**
 * One ranked list of job slots instead of a fixed order: every possible worker in every kind of job gets a priority,
 * and the people available fill the highest ones. The notes raise the slots they ask for by how much they matter, so a
 * clinic full of patients can outrank a third woodcutter, but a couple of bored colonists can't take the only forager.
 */
function rankedStaffing(w: World, want: Record<string, number>, budget: number, given: Record<string, number>, capacity: (k: string) => number, ch: string, pop: number) {
  const slots: { kind: string; k: number; p: number }[] = [];
  const firstP: Record<string, number> = { rawFood: 200, woodcutter: 190, kitchen: 120, clinic: 150, sawmill: 80, desk: 170 };
  const short: Record<string, boolean> = { rawFood: rawStock(w) < pop * 4, woodcutter: w.res.wood < 30 };
  const asked = new Map<string, { n: number; p: number }>();
  for (const c of actedConcerns(w)) for (const f of c.fixes) if ('staff' in f) {
    const p = c.weight * 2 + (SURVIVAL.some(k => c.id.startsWith(k)) ? 40 : 0);
    const prev = asked.get(f.staff);
    asked.set(f.staff, { n: Math.max(prev?.n ?? 0, f.n), p: Math.max(prev?.p ?? 0, p) });
  }
  const kinds = new Set([...Object.keys(want), ...asked.keys()]);
  for (const kind of kinds) {
    const cap = capacity(kind);
    const wantN = Math.max(want[kind] ?? 0, asked.get(kind)?.n ?? 0);
    for (let k = 0; k < Math.min(cap, wantN); k++) {
      let p = k === 0 && (want[kind] ?? 0) > 0 ? (firstP[kind] ?? 55) : 60 - 8 * k;
      if (short[kind] && k < (want[kind] ?? 0)) p += 60;
      if ((FOCUS[ch] ?? []).includes(kind)) p += 25;
      const a = asked.get(kind);
      if (a && k < a.n) p = Math.max(p, a.p);
      slots.push({ kind, k, p });
    }
  }
  slots.sort((a, b) => b.p - a.p);
  for (const s of slots) { if (budget <= 0) break; given[s.kind] = (given[s.kind] ?? 0) + 1; budget--; }
}

/** Kinds of building where the colony wants more workers than it has slots, so another is worth building. */
export function staffShortfall(w: World): string[] {
  const want = staffWants(w);
  const out: string[] = [];
  for (const [kind, n] of Object.entries(want)) {
    const slots = built(w).filter(b => defsOf(kind).includes(b.def)).reduce((m, b) => m + bdef(b).slots, 0) + sites(w).filter(b => defsOf(kind).includes(b.def)).reduce((m, b) => m + bdef(b).slots, 0);
    if (n > slots) out.push(kind);
  }
  return out;
}

function fit(w: World, c: Colonist, b: Building) {
  const job = bdef(b).job!;
  const moodPush = moodCharter(w) || avgMood(w) < 40;
  let s = c.skills[job] + (c.likes === job ? (moodPush ? 8 : 3) : 0) - (c.dislikes === job ? (moodPush ? 12 : 4) : 0);
  for (const o of workersAt(w, b.uid)) if (o.id !== c.id && (opinion(w, c.id, o.id) < -30 || opinion(w, o.id, c.id) < -30)) s -= 4;
  if (bedridden(c)) s -= 50;
  return s;
}

/** Move people to match the staffing plan, changing as few assignments as possible. */
export function autoStaff(w: World) {
  const plan = staffPlan(w, TRACE.on && Math.round(hourOfDay(w)) === 9);
  // first, release extras
  for (const [uid, n] of plan) {
    const b = w.buildings.find(x => x.uid === uid)!;
    const ws = workersAt(w, uid).sort((a, z) => fit(w, a, b) - fit(w, z, b));
    for (const c of ws.slice(0, Math.max(0, ws.length - n))) apply(w, { type: 'assign', colonist: c.id, building: null });
  }
  // nobody keeps a job they hate while a laborer could take it instead
  for (const c of alive(w)) {
    const b = buildingByUid(w, c.job); if (!b || !bdef(b).job || bdef(b).job !== c.dislikes) continue;
    const swap = alive(w).find(o => o.job == null && o.errand == null && !bedridden(o) && o.dislikes !== bdef(b).job);
    if (swap) { apply(w, { type: 'assign', colonist: c.id, building: null }); apply(w, { type: 'assign', colonist: swap.id, building: b.uid }); }
  }
  // split up people who can't stand a coworker
  if (fixesOf(w).some(f => 'reassign' in f && f.reassign !== 'hated')) for (const c of alive(w)) {
    if (c.job == null || !c.thoughts.some(t => t.value < 0 && (t.label.startsWith('Has to work with') || t.label.endsWith('won’t stop complaining')))) continue;
    const b = buildingByUid(w, c.job)!;
    const swap = alive(w).find(o => o.job == null && o.errand == null && !bedridden(o) && o.dislikes !== bdef(b).job && !workersAt(w, b.uid).some(x => opinion(w, o.id, x.id) < -20));
    if (swap) { apply(w, { type: 'assign', colonist: c.id, building: null }); apply(w, { type: 'assign', colonist: swap.id, building: b.uid }); }
  }
  // then fill gaps from laborers, best fit first
  for (const [uid, n] of [...plan].sort((a, b) => b[1] - a[1])) {
    const b = w.buildings.find(x => x.uid === uid)!;
    while (workersAt(w, uid).length < n) {
      const free = alive(w).filter(c => c.job == null && c.errand == null && !bedridden(c));
      if (!free.length) break;
      free.sort((a, z) => fit(w, z, b) - fit(w, a, b));
      apply(w, { type: 'assign', colonist: free[0].id, building: uid });
    }
  }
}

/** the current charter's "N kinds of meal with M of each in store" condition, if it has one */
function varietyPart(w: World): { kinds: number; each: number } | null {
  const c = charterDef(w.charter); if (!c) return null;
  const parts = c.metric.kind === 'all' ? c.metric.parts : [c.metric];
  const v = parts.find(p => p.kind === 'variety' && p.category === 'meal') as { kinds: number; each: number } | undefined;
  return v ?? null;
}
/** the meal kinds to build up for a variety condition: ones a staffed kitchen is making now first, then whatever's in store */
function varietyTargets(w: World, kinds: number): ResourceId[] {
  const making = new Set(built(w).filter(b => workersAt(w, b.uid).length).map(b => currentRecipe(w, b)?.output).filter((x): x is ResourceId => !!x && MEALS.includes(x)));
  const canMake = new Set(built(w).flatMap(b => recipesOf(b).filter(r => MEALS.includes(r.output) && enabledRecipes(b).includes(r)).map(r => r.output)));
  // kinds already being saved stay chosen, so the choice doesn't swap back and forth
  const score = (m: ResourceId) => (Number(making.has(m)) * 2 + Number(canMake.has(m))) * 1000 + w.res[m] + (BOT.ruleGap && w.forbidden.includes(m) ? 500 : 0);
  return [...MEALS].sort((a, z) => score(z) - score(a)).slice(0, kinds);
}
/** Keep the food a stockpiling charter needs out of people's mouths, as long as nobody will go hungry. */
export function autoFoodRules(w: World) {
  const pop = alive(w).length;
  const raw = rawStock(w);
  const keep: ResourceId[] = [];
  if (w.charter === 'piesky') keep.push('pie');
  if (w.charter === 'bread') keep.push('bread');
  if (w.charter === 'woodsmoke') keep.push('smokedFish');
  const rawEaters = concernsOf(w).find(c => c.id === 'raw')?.people ?? 0;
  const close = (charterProgress(w)?.ratio ?? 0) >= 0.6;
  const relaxed = close || rawEaters < pop / 3 || !BOT.advisor || BOT.off.includes('relaxFoodRules');
  // start keeping meals back with a good pile of raw food, and only stop once it's really run down, so the rules don't
  // flip back and forth as the pile wobbles around one line
  const keeping = MEALS.some(m => w.forbidden.includes(m));
  const rawFor = (start: number, stop: number) => raw > pop * (BOT.ruleGap && keeping ? stop : start);
  if (w.charter === 'settled' && rawFor(3, 1.8) && relaxed) keep.push(...MEALS);
  // a varied table: keep back only the kinds being built up, and only until each has its share; the rest is eaten as usual
  const vpart = varietyPart(w);
  if (vpart && rawFor(2, 1.2) && (relaxed || !BOT.varietyRules)) {
    if (!BOT.varietyRules) keep.push(...MEALS);
    // each kind kept until it's comfortably over its share, and kept again only once it's eaten nearly down to it
    else for (const m of varietyTargets(w, vpart.kinds)) if (w.res[m] < vpart.each + (BOT.ruleGap ? (w.forbidden.includes(m) ? 6 : 2) : 3)) keep.push(m);
  }
  // Fed and rested: raw food stays in storage while there are meals enough, so every meal is a cooked one
  if (w.charter === 'rested' && mealTotal(w) >= pop * 1.5) keep.push(...RAW_FOODS);
  // never let anyone starve for a charter: while what's left to eat is under 1.5 each, release the kept food with the
  // most in store (so a big pile of stew goes back on the menu before the pies anyone is saving)
  const open = () => [...MEALS, ...RAW_FOODS].filter(f => !keep.includes(f)).reduce((n, f) => n + w.res[f], 0);
  if (!BOT.varietyRules) { if (open() < pop * 1.5) keep.length = 0; }
  else while (keep.length && open() < pop * (BOT.ruleGap && keeping ? 1 : 1.5)) { keep.sort((a, z) => w.res[z] - w.res[a]); keep.shift(); }
  for (const f of [...MEALS, ...RAW_FOODS] as ResourceId[]) {
    const allowed = !keep.includes(f);
    if (allowed === w.forbidden.includes(f)) apply(w, { type: 'foodRule', food: f, allowed });
  }
}

// ---------- Storage ----------
const centroid = (w: World, ids: string[]) => {
  const bs = built(w).filter(b => ids.includes(b.def));
  if (!bs.length) return { x: CENTER, y: CENTER };
  const x = bs.reduce((n, b) => n + centerOf(b).x, 0) / bs.length, y = bs.reduce((n, b) => n + centerOf(b).y, 0) / bs.length;
  return { x: (x + CENTER) / 2, y: (y + CENTER) / 2 };
};
/** storehouses (food) go between the food producers and the kitchens; extra stockpiles (goods) by the woodcutters */
function storageSpot(w: World, id: string) {
  if (id === 'storehouse') return centroid(w, ['forager', 'dock', 'orchard', 'kitchen', 'pieoven', 'smokehouse', 'bakery']);
  if (id === 'stockpile' && w.buildings.some(b => b.def === 'stockpile')) return centroid(w, ['woodcutter', 'sawmill', 'brewery', 'ciderpress']);
  return { x: CENTER, y: CENTER };
}
/** keep food in storehouses, where it stays fresh, and goods on stockpiles */
export function autoStorage(w: World) {
  const depot = storages(w).find(b => b.uid === depots.get(w));
  if (depot) {
    if (!depot.high) apply(w, { type: 'storagePriority', building: depot.uid, high: true });
    const allow = BOT.foodDepot === 'meals' ? MEALS : FOODS;
    if (!depot.allow || depot.allow.length !== allow.length) apply(w, { type: 'storageFilter', building: depot.uid, allow });
  }
  const piles = storages(w).filter(b => !bdef(b).keepsFresh && b !== depot);
  for (const b of storages(w)) {
    if (b === depot) continue;
    const want = bdef(b).keepsFresh && piles.length ? FOODS : null;
    const same = want === null ? b.allow === null : !!b.allow && b.allow.length === want.length;
    if (!same) apply(w, { type: 'storageFilter', building: b.uid, allow: want });
  }
  if (storages(w).some(b => bdef(b).keepsFresh)) for (const b of piles) {
    const same = !!b.allow && b.allow.length === GOODS.length;
    if (!same) apply(w, { type: 'storageFilter', building: b.uid, allow: GOODS });
  }
}
