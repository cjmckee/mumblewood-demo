// A heuristic player, used by the balance harness to play thousands of runs headlessly.
// It reads the active charter and plays towards it, the way a person would.
import { BUILDING_BY_ID, BUILDINGS, CHARTERS, CATEGORIES, EVENTS, ResourceId, MEALS, RAW_FOODS, Recipe, InputKey, membersOf, recipeRate } from './content';
import { assess, Concern, defsOf } from './advisor';
import { World, apply, alive, beds, mealTotal, sites, findSpot, CENTER, CHARTER_HELPERS, avgMood, built, MAP_SIZE, pathAt, terrainAt, T_WATER, bdef, workersAt, blockedReason, opinion, Building, Colonist, hourOfDay, charterProgress, buildingByUid, storageFree, storages, FOODS, GOODS, bedridden, foodTotal, currentRecipe, drinkTotal, siteOk, enabledRecipes, recipesOf, rerollCost, stockOf, usableHere } from './world';

const BLUEPRINT_PRIORITY = ['sawmill', 'pieoven', 'dock', 'cottage', 'brewery', 'ciderpress', 'tavern', 'kiln', 'claypit', 'carpenter', 'orchard', 'field', 'apiary', 'smokehouse', 'cellar', 'stage', 'bathhouse', 'bakery', 'apothecary', 'herbgarden', 'mill'];
const DRINK_MAKERS = ['brewery', 'ciderpress'];
/** workshops that make planks, bricks or wicker */
const FINE_MAKERS = ['sawmill', 'kiln', 'carpenter'];
const rawStock = (w: World) => RAW_FOODS.reduce((n, r) => n + w.res[r], 0);
/** gatherers (no inputs) the colony owns that make r, on this map */
const gatherersOf = (w: World, r: string) => BUILDINGS.filter(d => (d.basic || w.owned.includes(d.id)) && siteOk(w, d) && (d.recipes ?? []).some(x => x.output === r && !Object.keys(x.inputs).length)).map(d => d.id);
/** the best switched-on recipe a workshop could run once its gatherers are going: every input has a built or owned gatherer here */
function plannedRecipe(w: World, b: Building): Recipe | undefined {
  return enabledRecipes(b).find(r => Object.keys(r.inputs).every(k => membersOf(k as InputKey).some(m => suppliable(w, m, 2))));
}
/** a good the colony can get: gathered by something owned, or made by an owned workshop from goods it can get (flour from grain) */
function suppliable(w: World, r: ResourceId, depth: number): boolean {
  if (gatherersOf(w, r).length) return true;
  if (depth <= 0) return false;
  return BUILDINGS.some(d => (d.basic || w.owned.includes(d.id)) && (d.recipes ?? []).some(x => x.output === r && Object.keys(x.inputs).length && Object.keys(x.inputs).every(k => membersOf(k as InputKey).some(m => suppliable(w, m, depth - 1)))));
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
const plannedUses = (w: World, input: ResourceId) => built(w).some(b => { const r = plannedRecipe(w, b); return !!r && Object.keys(r.inputs).some(k => membersOf(k as InputKey).includes(input)); });
const PERK_PRIORITY = ['saintsDay', 'ironWill', 'communalPot', 'overtime', 'rations', 'earplugs', 'warmHearth', 'gossipBan', 'matchmaker'];
const MOOD_BUILDINGS = ['tavern', 'brewery', 'ciderpress', 'pieoven', 'bathhouse', 'cottage', 'stage'];
const MOOD_CHARTERS = ['cheer', 'harmony', 'calm'];
/** experiment switches for the balance tools */
/**
 * Experiment switches for the balance tools. `advisor` makes the bot play from what's on screen (the complaint
 * panel) instead of its own rules; it's off by default because, so far, it plays worse (see the project doc).
 */
export const BOT = { foodDepot: 'food' as false | 'food' | 'meals', laborersPer: 3.5, advisor: false, gate: true, ranked: true, comfort: 'strict' as 'strict' | 'econ' | 'none', rescue: false, rescueAt: 40, moodBlock: false, reroll: true, off: [] as string[], skip: [] as string[] };
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
const SURVIVAL = ['hungry', 'cold', 'wood', 'sick', 'beds', 'storage', 'idle-', 'foodflow', 'woodflow', 'slack'];
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
  const saved = { charter: w.charter, hours: w.charterHours, base: w.charterBase, log: w.moodLog };
  w.charter = id; w.charterHours = 0; w.charterBase = { cured: w.stats.cured, errands: w.stats.errands }; w.moodLog = [];
  const r = charterProgress(w)?.ratio ?? 0;
  w.charter = saved.charter; w.charterHours = saved.hours; w.charterBase = saved.base; w.moodLog = saved.log;
  return r;
}
const charterKind = (w: World) => CHARTERS.find(c => c.id === w.charter)?.metric.kind;
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
    } else if (style === 'random') {
      const n = d.kind === 'event' ? 2 : d.kind === 'recruit' ? 3 : d.options.length;
      option = Math.floor(rand() * n);
    } else if (d.kind === 'charter') {
      // prefer charters we're already close to; long mood holds are a gamble
      const score = (id: string) => {
        const c = CHARTERS.find(x => x.id === id)!;
        const hold = ['avgMood', 'contentPop', 'calm', 'avgBeauty'].includes(c.metric.kind) ? -1 : 0;
        // a charter that needs a building we don't own (and can't build) is a bad bet
        const needs: Record<string, string[]> = { feast: ['drinks'], pieday: ['pieoven'], lumber: ['sawmill'], cheer: ['sawmill'], harmony: ['sawmill'] };
        const missing = (needs[id] ?? []).filter(b => b === 'drinks' ? !DRINK_MAKERS.some(d => w.owned.includes(d)) : !w.owned.includes(b)).length * -2;
        // a variety charter is a bad bet until the colony can already make enough different kinds
        const m = c.metric;
        const short = m.kind === 'variety' ? Math.max(0, m.kinds - kindsMakeable(w, CATEGORIES[m.category].members)) * -2 : 0;
        return progressIf(w, id) * 3 + hold + missing + short;
      };
      option = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
    } else if (d.kind === 'blueprint') {
      const helpers = CHARTER_HELPERS[w.charter ?? ''] ?? [];
      const feedable = (id: string) => id !== 'smokehouse' || w.owned.includes('dock');
      // a blueprint that needs planks is dead weight until there's a sawmill; a tavern without a brewery serves nothing
      const usable = (id: string) => (BUILDING_BY_ID[id].cost.fine && !FINE_MAKERS.some(f => w.owned.includes(f) && usableHere(w, f)) && !FINE_MAKERS.includes(id) ? 6 : 0) + (id === 'tavern' && !DRINK_MAKERS.some(d => w.owned.includes(d)) ? 3 : 0)
        // a gatherer is worth more once something owned turns its harvest into a drink; a drink maker is worth more when its best recipe can be fed here
        - (BUILDING_BY_ID[id].needs && (BUILDING_BY_ID[id].recipes ?? []).some(r => w.owned.some(d => (BUILDING_BY_ID[d].recipes ?? []).some(x => Object.keys(x.inputs).includes(r.output)))) ? 6 : 0)
        // a workshop nothing owned can feed yet (a kiln before a clay pit) waits behind the rest
        + (BUILDING_BY_ID[id].recipes && !usableHere(w, id) ? 5 : 0)
        - (DRINK_MAKERS.includes(id) && (BUILDING_BY_ID[id].recipes ?? []).filter(r => r.stars >= 2).some(r => Object.keys(r.inputs).every(k => gatherersOf(w, k).length || BUILDINGS.some(d => d.draftable && siteOk(w, d) && (d.recipes ?? []).some(x => x.output === k)))) ? 2 : 0);
      const asked = fixesOf(w, 3).filter((f): f is { draft: string } => 'draft' in f).map(f => f.draft);
      const rank = (id: string) => (helpers.includes(id) && feedable(id) ? -100 + helpers.indexOf(id) : 0) + (asked.includes(id) ? -50 + asked.indexOf(id) : 0) + BLUEPRINT_PRIORITY.indexOf(id) + usable(id);
      // nothing on offer the colony is missing and wants: pay for a reroll while wood stays comfortable
      const core = ['sawmill', 'tavern', 'cottage', 'pieoven', 'stage', 'bathhouse', 'dock', ...(DRINK_MAKERS.some(x => w.owned.includes(x)) ? [] : DRINK_MAKERS)];
      const wanted = (id: string) => (helpers.includes(id) && feedable(id)) || asked.includes(id) || (core.includes(id) && usable(id) < 6);
      if (BOT.reroll && !d.options.some(wanted) && w.res.wood >= rerollCost(w) + 40 && !apply(w, { type: 'reroll' })) continue;
      option = d.options.map(rank).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
    } else if (d.kind === 'perk') {
      option = d.options.map(o => PERK_PRIORITY.indexOf(o)).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
    } else if (d.kind === 'recruit') {
      const score = (c: typeof d.options[number]) => (c.traits.includes('sunny') ? 2 : 0) + (c.traits.includes('diligent') ? 1 : 0) + (c.traits.includes('romantic') && w.charter === 'lovebirds' ? 2 : 0)
        - (c.traits.includes('grumbler') ? 2 : 0) - (c.traits.includes('drama') ? 1 : 0) - (c.traits.includes('vain') ? 1 : 0);
      const bestI = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
      const kind = charterKind(w);
      const wantsPeople = kind === 'population' || kind === 'contentPop';
      // mood charters: every settler past 8 adds strain, so take only as many as the charter needs
      const m = CHARTERS.find(c => c.id === w.charter)?.metric as { pop?: number } | undefined;
      const cap = kind === 'contentPop' || kind === 'calm' ? (m?.pop ?? 12) : wantsPeople ? 30 : kind === 'avgMood' ? 9 : 12;
      // only take on mouths the larder can feed
      const raw = rawStock(w) + mealTotal(w);
      const fed = raw > alive(w).length * 3;
      const ok = alive(w).length < cap && alive(w).length < beds(w) + 2 && (wantsPeople || avgMood(w) > 40) && fed;
      option = ok ? bestI : 99;
    } else if (d.kind === 'event') {
      const ev = EVENTS.find(e => e.id === d.eventId)!;
      option = canPay(w, ev.options[0].effect) ? 0 : 1;
    }
    apply(w, { type: 'resolve', option });
  }
}

function canPay(w: World, effect: string) {
  const food = rawStock(w) + mealTotal(w);
  switch (effect) {
    case 'payFood20': return food > 60;
    case 'bardPlay': return drinkTotal(w) >= 6 && w.charter !== 'feast';
    case 'pigeonBribe': return w.res.berries >= 15;
    case 'wedding': return mealTotal(w) >= 8 && drinkTotal(w) >= 5 && w.charter !== 'feast';
    case 'outhouseFix': return w.res.planks >= 10 && w.charter !== 'lumber';
    case 'peddlerPlanks': return w.res.wood >= 50;
    default: return true;
  }
}

/** Lay out blueprints the colony can afford, at most two construction sites at a time. Called hourly. */
export function autoBuild(w: World) {
  const kind = charterKind(w);
  const saving: ResourceId[] = w.charter === 'lumber' ? ['planks'] : w.charter === 'woodpile' ? ['wood'] : [];
  const pop = alive(w).length;
  const count = (id: string) => w.buildings.filter(b => b.def === id).length;
  // running low on food opens an extra site, so a new forager never waits behind flowerbeds
  const maxSites = (w.charter === 'township' || w.charter === 'garden' ? 3 : 2) + (foodTotal(w) < pop * 4 ? 1 : 0);
  if (sites(w).length < maxSites) {
    const want: string[] = [];
    // wood is the economy: keep about one woodcutter per three settlers, more while short

    const pendingBeds = sites(w).reduce((n, b) => n + (BUILDING_BY_ID[b.def].beds ?? 0), 0);
    if (beds(w) + pendingBeds < pop + 1) want.push(w.owned.includes('cottage') && stockOf(w, 'fine') >= 10 && !saving.includes('planks') ? 'cottage' : 'leanto');
    // what people are complaining about comes next, biggest complaint first
    for (const f of fixesOf(w)) if ('build' in f && f.build && (w.owned.includes(f.build) || BUILDING_BY_ID[f.build].basic) && !want.includes(f.build)) want.push(f.build);
    if (count('dining') < Math.ceil(pop / 6)) want.push('dining');
    if (count('kitchen') === 0) want.push('kitchen');
    if (count('clinic') === 0 && (day(w) >= 4 || alive(w).some(c => c.illness))) want.push('clinic');
    for (const id of CHARTER_HELPERS[w.charter ?? ''] ?? []) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    for (const id of BLUEPRINT_PRIORITY.slice(0, 2)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    if (count('storehouse') === 0 && day(w) >= 3) want.push('storehouse');
    const garden = w.charter === 'garden' || w.charter === 'pretty';
    if (garden) { if (count('flowerbed') < 10) want.unshift('flowerbed'); if (count('lantern') < 4) want.push('lantern'); }
    if (kind === 'avgMood' || kind === 'contentPop' || kind === 'couples' || kind === 'calm' || ((!BOT.advisor || BOT.moodBlock) && avgMood(w) < 45)) {
      for (const id of MOOD_BUILDINGS) if (w.owned.includes(id) && count(id) === 0) want.push(id);
      const spare = w.res.wood > 45;
      if (count('flowerbed') < 6 && spare) want.push('flowerbed');
      if (count('statue') < 2 && !saving.includes('planks') && stockOf(w, 'fine') > 30) want.push('statue');
      if (count('lantern') < 3 && spare) want.push('lantern');
      // swap drafty lean-tos for cottages when planks allow
      if (w.owned.includes('cottage') && count('cottage') < Math.ceil(pop / 2) && stockOf(w, 'fine') >= 14) want.unshift('cottage');
    }
    // one of everything owned, except site gatherers nothing is waiting on yet
    const waitedOn = staffWants(w).drinks > 0 || staffWants(w).sawmill > 0 ? neededGatherers(w) : [];
    for (const id of BLUEPRINT_PRIORITY.slice(2)) if (w.owned.includes(id) && count(id) === 0 && (!BUILDING_BY_ID[id].needs || id === 'dock' || waitedOn.includes(id))) want.push(id);
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
    // more room when one kind of good runs out of space
    if (storageFree(w, 'wood') < 30 && storages(w).length > 0) want.unshift('stockpile');
    if (count('storehouse') > 0 && storageFree(w, 'berries') < 30) want.unshift(count('storehouse') < 2 ? 'storehouse' : 'stockpile');
    if (w.owned.includes('sawmill') && w.charter === 'lumber' && count('sawmill') < 2) want.push('sawmill');
    for (const id of want) {
      if (sites(w).some(b => b.def === id)) continue;
      const def = BUILDING_BY_ID[id];
      if (id === 'smokehouse' && !w.buildings.some(b => b.def === 'dock')) continue;
      if (def.recipes && !usableHere(w, id)) continue;
      if (id === 'pieoven' && !w.buildings.some(b => FINE_MAKERS.includes(b.def)) && stockOf(w, 'fine') < 8) continue;
      // while saving a resource, only spend it on beds and on producers that make more of it
      const essential = id === 'leanto' || (saving.includes('wood') && id === 'woodcutter') || (saving.includes('planks') && id === 'sawmill');
      const short = Object.entries(def.cost).some(([r, n]) => stockOf(w, r as InputKey) < (n ?? 0) + (r === 'wood' ? 10 : 0) || (saving.some(x => membersOf(r as InputKey).includes(x)) && !essential));
      if (short) continue;
      // decorations go by the hearth; storage next to what it serves; everything else near the centre
      const near = storageSpot(w, id);
      const spot = findSpot(w, id, near.x, near.y, !def.decor);
      if (!spot) continue;
      apply(w, { type: 'place', def: id, x: spot.x, y: spot.y });
      break;
    }
  }
  // lay paths from each doorway towards the hearth: right away for path charters, otherwise once wood is comfortable
  const pathCharter = w.charter === 'paved' || w.charter === 'garden';
  const planned = w.paths.filter(p => p === 1).length;
  if ((pathCharter && planned < 12 && w.res.wood > 8) || (w.res.wood > 60 && Math.round(w.hour) % 24 === 9)) {
    for (const b of built(w)) {
      if (bdef(b).decor || bdef(b).walkable || b.def === 'hearth') continue;
      let x = b.x + Math.floor(bdef(b).w / 2), y = b.y + bdef(b).h;
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
  const drinksWanted = ch === 'feast' ? 2 : drinkTotal(w) < 15 && built(w).some(b => b.def === 'tavern') ? 1 : 0;
  return {
    woodcutter: 1 + Math.floor(pop / 5) + (ch === 'woodpile' ? 2 : ['paved', 'garden', 'lumber', 'township', ...MOOD_CHARTERS].includes(ch) ? 1 : 0) + (w.res.wood < 25 ? 1 : 0),
    rawFood: rawFoodWorkers(w, pop) + (raw < pop * 4 ? 1 : 0) + (['pantry', 'feast', 'pieday'].includes(ch) ? 1 : 0),
    kitchen: Math.max(1, Math.ceil(pop / 9)) + (['pantry', 'feast'].includes(ch) ? 1 : 0),
    sawmill: (stockOf(w, 'fine') < planksWanted(w) ? 2 : stockOf(w, 'fine') < 25 ? 1 : 0) + (['lumber', 'pieday', 'garden', 'pretty', ...MOOD_CHARTERS].includes(ch) ? 1 : 0),
    pieoven: ch === 'pieday' ? 2 : ['cheer', 'feast', 'harmony', 'calm'].includes(ch) ? 1 : 0,
    drinks: drinksWanted,
    // bricks: a kiln works while the colony is short of fine materials and can get clay
    kiln: stockOf(w, 'fine') < planksWanted(w) && plannedUses(w, 'clay') ? 2 : 0,
    claypit: stockOf(w, 'fine') < planksWanted(w) && plannedUses(w, 'clay') ? 2 : 0,
    // a varied table: bread from flour, skewers from herbs, remedies for the clinic
    bakery: built(w).some(b => b.def === 'bakery') && (mealTotal(w) < pop * 3 || ch === 'menu') ? 1 + (ch === 'menu' ? 1 : 0) : 0,
    mill: built(w).some(b => b.def === 'bakery') && plannedUses(w, 'flour') ? 1 : 0,
    apothecary: built(w).some(b => b.def === 'apothecary') && (alive(w).some(c => c.illness) || stockOf(w, 'remedy') < 6 || ch === 'tasting') ? 1 : 0,
    herbgarden: built(w).some(b => b.def === 'apothecary') || ch === 'menu' ? 1 : 0,
    // gatherers for a drink maker's best recipe work as long as the drink makers do
    field: (drinksWanted || built(w).some(b => b.def === 'mill' || b.def === 'bakery')) && plannedUses(w, 'grain') ? 2 : 0,
    apiary: drinksWanted && plannedUses(w, 'honey') ? 1 : 0,
    smokehouse: w.res.fish > 20 || ch === 'menu' ? 1 : 0,
    tavern: built(w).some(b => b.def === 'tavern') ? 1 : 0,
    clinic: alive(w).some(c => bedridden(c)) ? 1 : 0,
  };
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
export function staffPlan(w: World): Map<number, number> {
  const pop = alive(w).filter(c => !bedridden(c)).length;
  const ch = w.charter ?? '';
  const want = staffWants(w);
  // a skeleton crew keeps its jobs going and builds with whoever is left
  const extraHands = fixesOf(w).reduce((n, f) => n + ('laborers' in f ? f.laborers : 0), 0);
  const slack = BOT.advisor && concernsOf(w).some(c => c.id === 'slack') ? 1 : 0;
  const keepFree = Math.max(1, (pop <= 5 ? 1 : Math.max(2, Math.ceil(pop / BOT.laborersPer)) + (sites(w).length > 1 ? 1 : 0)) + Math.min(1, extraHands) - slack);
  let budget = Math.max(0, pop - keepFree);
  const given: Record<string, number> = {};
  const plan = new Map<number, number>();
  const capacity = (kind: string) => built(w).filter(b => defsOf(kind).includes(b.def) && !blockedReason(w, b)).reduce((n, b) => n + bdef(b).slots, 0);
  const give = (kind: string, upTo: number) => {
    while (budget > 0 && (given[kind] ?? 0) < Math.min(upTo, want[kind] ?? 0, capacity(kind))) { given[kind] = (given[kind] ?? 0) + 1; budget--; }
  };
  if (BOT.advisor && BOT.ranked) {
    rankedStaffing(w, want, budget, given, capacity, ch, pop);
  } else {
  // 1. essentials, one each
  // food and wood first: everything else is built from them
  give('rawFood', 1); give('woodcutter', 1); give('kitchen', 1);
  // then what the complaints call for, biggest first
  const serveFixes = () => { for (const f of fixesOf(w)) if ('staff' in f) { want[f.staff] = Math.max(want[f.staff] ?? 0, f.n); give(f.staff, f.n); } };
  if (rawStock(w) < pop * 4) give('rawFood', 99);
  if (w.res.wood < 30) give('woodcutter', 99);
  give('clinic', 1);
  serveFixes();
  // planks unlock every mood building, so the sawmill counts as an essential once there's something to spend them on
  give('sawmill', 1);
  // 2. whatever the charter leans on
  const focus: Record<string, string[]> = {
    lumber: ['sawmill'], pieday: ['pieoven', 'sawmill'], feast: ['drinks', 'field', 'apiary', 'kitchen'], pantry: ['kitchen', 'rawFood'], menu: ['kitchen', 'smokehouse', 'pieoven', 'bakery', 'rawFood'], tasting: ['drinks', 'apothecary', 'herbgarden', 'field', 'apiary'], healthy: ['clinic', 'apothecary', 'herbgarden'],
    woodpile: ['woodcutter'], paved: ['woodcutter'], garden: ['sawmill', 'woodcutter'], cheer: ['sawmill', 'woodcutter', 'tavern', 'drinks', 'field', 'pieoven'], calm: ['sawmill', 'tavern', 'drinks', 'field', 'pieoven'], harmony: ['sawmill', 'woodcutter', 'tavern', 'drinks', 'field', 'pieoven'],
  };
  for (const k of focus[ch] ?? []) give(k, 99);
  // 3. everything else, round-robin so no one kind eats the budget
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
  return plan;
}

const FOCUS: Record<string, string[]> = {
  lumber: ['sawmill'], pieday: ['pieoven', 'sawmill'], feast: ['drinks', 'field', 'apiary', 'kitchen'], pantry: ['kitchen', 'rawFood'], menu: ['kitchen', 'smokehouse', 'pieoven', 'bakery', 'rawFood'], tasting: ['drinks', 'apothecary', 'herbgarden', 'field', 'apiary'], healthy: ['clinic', 'apothecary', 'herbgarden'],
  woodpile: ['woodcutter'], paved: ['woodcutter'], garden: ['sawmill', 'woodcutter'], cheer: ['sawmill', 'woodcutter', 'tavern', 'drinks', 'field', 'pieoven'], calm: ['sawmill', 'tavern', 'drinks', 'field', 'pieoven'], harmony: ['sawmill', 'woodcutter', 'tavern', 'drinks', 'field', 'pieoven'],
};
/**
 * One ranked list of job slots instead of a fixed order: every possible worker in every kind of job gets a priority,
 * and the people available fill the highest ones. The notes raise the slots they ask for by how much they matter, so a
 * clinic full of patients can outrank a third woodcutter, but a couple of bored colonists can't take the only forager.
 */
function rankedStaffing(w: World, want: Record<string, number>, budget: number, given: Record<string, number>, capacity: (k: string) => number, ch: string, pop: number) {
  const slots: { kind: string; k: number; p: number }[] = [];
  const firstP: Record<string, number> = { rawFood: 200, woodcutter: 190, kitchen: 120, clinic: 150, sawmill: 80 };
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
  const moodPush = MOOD_CHARTERS.includes(w.charter ?? '') || avgMood(w) < 40;
  let s = c.skills[job] + (c.likes === job ? (moodPush ? 8 : 3) : 0) - (c.dislikes === job ? (moodPush ? 12 : 4) : 0);
  for (const o of workersAt(w, b.uid)) if (o.id !== c.id && (opinion(w, c.id, o.id) < -30 || opinion(w, o.id, c.id) < -30)) s -= 4;
  if (bedridden(c)) s -= 50;
  return s;
}

/** Move people to match the staffing plan, changing as few assignments as possible. */
export function autoStaff(w: World) {
  const plan = staffPlan(w);
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

/** Keep the food a stockpiling charter needs out of people's mouths, as long as nobody will go hungry. */
export function autoFoodRules(w: World) {
  const pop = alive(w).length;
  const raw = rawStock(w);
  const keep: ResourceId[] = [];
  if (w.charter === 'pieday') keep.push('pie');
  const rawEaters = concernsOf(w).find(c => c.id === 'raw')?.people ?? 0;
  const close = (charterProgress(w)?.ratio ?? 0) >= 0.6;
  if ((w.charter === 'pantry' || w.charter === 'feast' || w.charter === 'menu') && raw > pop * 3 && (close || rawEaters < pop / 3 || !BOT.advisor || BOT.off.includes('relaxFoodRules'))) keep.push(...MEALS);
  if (raw < pop * 1.5) keep.length = 0; // never let anyone starve for a charter
  for (const f of [...MEALS, ...RAW_FOODS] as ResourceId[]) {
    const allowed = !keep.includes(f);
    if (allowed === w.forbidden.includes(f)) apply(w, { type: 'foodRule', food: f, allowed });
  }
}

// ---------- Storage ----------
const centroid = (w: World, ids: string[]) => {
  const bs = built(w).filter(b => ids.includes(b.def));
  if (!bs.length) return { x: CENTER, y: CENTER };
  const x = bs.reduce((n, b) => n + b.x + bdef(b).w / 2, 0) / bs.length, y = bs.reduce((n, b) => n + b.y + bdef(b).h / 2, 0) / bs.length;
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
