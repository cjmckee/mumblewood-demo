// A heuristic player, used by the balance harness to play thousands of runs headlessly.
// It reads the active charter and plays towards it, the way a person would.
import { BUILDING_BY_ID, CHARTERS, EVENTS, ResourceId, MEALS } from './content';
import { assess, Concern, defsOf } from './advisor';
import { World, apply, alive, beds, mealTotal, sites, findSpot, CENTER, CHARTER_HELPERS, avgMood, built, MAP_SIZE, pathAt, terrainAt, T_WATER, bdef, workersAt, blockedReason, opinion, Building, Colonist, hourOfDay, charterProgress, buildingByUid, storageFree, storages, FOODS, GOODS, bedridden, foodTotal } from './world';

const BLUEPRINT_PRIORITY = ['sawmill', 'pieoven', 'dock', 'cottage', 'brewery', 'tavern', 'smokehouse', 'cellar', 'stage', 'bathhouse'];
const PERK_PRIORITY = ['saintsDay', 'ironWill', 'communalPot', 'overtime', 'rations', 'earplugs', 'warmHearth', 'gossipBan', 'matchmaker'];
const MOOD_BUILDINGS = ['tavern', 'brewery', 'pieoven', 'bathhouse', 'cottage', 'stage'];
const MOOD_CHARTERS = ['cheer', 'harmony', 'calm'];
/** experiment switches for the balance tools */
/**
 * Experiment switches for the balance tools. `advisor` makes the bot play from what's on screen (the complaint
 * panel) instead of its own rules; it's off by default because, so far, it plays worse (see the project doc).
 */
export const BOT = { foodDepot: 'food' as false | 'food' | 'meals', laborersPer: 3.5, advisor: false, gate: true, off: [] as string[] };
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
const SURVIVAL = ['hungry', 'cold', 'wood', 'sick', 'beds', 'storage', 'idle-'];
const comfortable = (w: World) => foodTotal(w) >= alive(w).length * 4 && w.res.wood >= 25;
const fixesOf = (w: World, top = 4) => concernsOf(w)
  .filter(c => !BOT.gate || SURVIVAL.some(k => c.id.startsWith(k)) || comfortable(w))
  .slice(0, top).flatMap(c => c.fixes).filter(f => !BOT.off.includes(Object.keys(f)[0]));

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
        const needs: Record<string, string[]> = { feast: ['brewery'], pieday: ['pieoven'], lumber: ['sawmill'], cheer: ['sawmill'], harmony: ['sawmill'] };
        const missing = (needs[id] ?? []).filter(b => !w.owned.includes(b)).length * -2;
        return progressIf(w, id) * 3 + hold + missing;
      };
      option = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
    } else if (d.kind === 'blueprint') {
      const helpers = CHARTER_HELPERS[w.charter ?? ''] ?? [];
      const feedable = (id: string) => id !== 'smokehouse' || w.owned.includes('dock');
      // a blueprint that needs planks is dead weight until there's a sawmill; a tavern without a brewery serves nothing
      const usable = (id: string) => (BUILDING_BY_ID[id].cost.planks && !w.owned.includes('sawmill') && id !== 'sawmill' ? 6 : 0) + (id === 'tavern' && !w.owned.includes('brewery') ? 3 : 0);
      const asked = fixesOf(w, 3).filter((f): f is { draft: string } => 'draft' in f).map(f => f.draft);
      const rank = (id: string) => (helpers.includes(id) && feedable(id) ? -100 + helpers.indexOf(id) : 0) + (asked.includes(id) ? -50 + asked.indexOf(id) : 0) + BLUEPRINT_PRIORITY.indexOf(id) + usable(id);
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
      const raw = w.res.berries + w.res.fish + w.res.mushrooms + mealTotal(w);
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
  const food = (['berries', 'fish', 'mushrooms', 'stew', 'pie', 'smokedFish'] as ResourceId[]).reduce((n, r) => n + w.res[r], 0);
  switch (effect) {
    case 'payFood20': return food > 60;
    case 'bardPlay': return w.res.ale >= 6 && w.charter !== 'feast';
    case 'pigeonBribe': return w.res.berries >= 15;
    case 'wedding': return mealTotal(w) >= 8 && w.res.ale >= 5 && w.charter !== 'feast';
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
    if (beds(w) + pendingBeds < pop + 1) want.push(w.owned.includes('cottage') && w.res.planks >= 10 && !saving.includes('planks') ? 'cottage' : 'leanto');
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
    if (kind === 'avgMood' || kind === 'contentPop' || kind === 'couples' || kind === 'calm' || (!BOT.advisor && avgMood(w) < 45)) {
      for (const id of MOOD_BUILDINGS) if (w.owned.includes(id) && count(id) === 0) want.push(id);
      const spare = w.res.wood > 45;
      if (count('flowerbed') < 6 && spare) want.push('flowerbed');
      if (count('statue') < 2 && !saving.includes('planks') && w.res.planks > 30) want.push('statue');
      if (count('lantern') < 3 && spare) want.push('lantern');
      // swap drafty lean-tos for cottages when planks allow
      if (w.owned.includes('cottage') && count('cottage') < Math.ceil(pop / 2) && w.res.planks >= 14) want.unshift('cottage');
    }
    for (const id of BLUEPRINT_PRIORITY.slice(2)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    // only add producers when the colony wants more workers there than it has slots for
    const short = staffShortfall(w);
    if (short.includes('woodcutter')) want.unshift('woodcutter');
    if (short.includes('rawFood')) {
      const hut = w.owned.includes('dock') && count('dock') === 0 ? 'dock' : 'forager';
      if (foodTotal(w) < pop * 5) want.unshift(hut); else want.push(hut);
    }
    if (short.includes('kitchen')) want.push('kitchen');
    for (const k of ['sawmill', 'pieoven', 'brewery']) if (short.includes(k) && w.owned.includes(k)) want.push(k);
    if (count('storehouse') === 0) want.push('storehouse');
    // more room when one kind of good runs out of space
    if (storageFree(w, 'wood') < 30 && storages(w).length > 0) want.unshift('stockpile');
    if (count('storehouse') > 0 && storageFree(w, 'berries') < 30) want.unshift(count('storehouse') < 2 ? 'storehouse' : 'stockpile');
    if (w.owned.includes('sawmill') && w.charter === 'lumber' && count('sawmill') < 2) want.push('sawmill');
    for (const id of want) {
      if (sites(w).some(b => b.def === id)) continue;
      const def = BUILDING_BY_ID[id];
      if (id === 'smokehouse' && !w.buildings.some(b => b.def === 'dock')) continue;
      if (id === 'pieoven' && !w.buildings.some(b => b.def === 'sawmill') && w.res.planks < 8) continue;
      // while saving a resource, only spend it on beds and on producers that make more of it
      const essential = id === 'leanto' || (saving.includes('wood') && id === 'woodcutter') || (saving.includes('planks') && id === 'sawmill');
      const short = Object.entries(def.cost).some(([r, n]) => w.res[r as ResourceId] < (n ?? 0) + (r === 'wood' ? 10 : 0) || (saving.includes(r as ResourceId) && !essential));
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
  const raw = w.res.berries + w.res.fish + w.res.mushrooms;
  return {
    woodcutter: 1 + Math.floor(pop / 5) + (ch === 'woodpile' ? 2 : ['paved', 'garden', 'lumber', 'township', ...MOOD_CHARTERS].includes(ch) ? 1 : 0) + (w.res.wood < 25 ? 1 : 0),
    rawFood: rawFoodWorkers(w, pop) + (raw < pop * 4 ? 1 : 0) + (['pantry', 'feast', 'pieday'].includes(ch) ? 1 : 0),
    kitchen: Math.max(1, Math.ceil(pop / 9)) + (['pantry', 'feast'].includes(ch) ? 1 : 0),
    sawmill: (w.res.planks < planksWanted(w) ? 2 : w.res.planks < 25 ? 1 : 0) + (['lumber', 'pieday', 'garden', 'pretty', ...MOOD_CHARTERS].includes(ch) ? 1 : 0),
    pieoven: ch === 'pieday' ? 2 : ['cheer', 'feast', 'harmony', 'calm'].includes(ch) ? 1 : 0,
    brewery: ch === 'feast' ? 2 : w.res.ale < 15 && built(w).some(b => b.def === 'tavern') ? 1 : 0,
    smokehouse: w.res.fish > 20 ? 1 : 0,
    tavern: built(w).some(b => b.def === 'tavern') ? 1 : 0,
    clinic: alive(w).some(c => bedridden(c)) ? 1 : 0,
  };
}
/** planks the colony could spend right now: owned blueprints not yet built, plus what sites still need */
function planksWanted(w: World) {
  let n = 0;
  for (const id of w.owned) if (!w.buildings.some(b => b.def === id)) n += BUILDING_BY_ID[id].cost.planks ?? 0;
  for (const b of sites(w)) n += Math.max(0, (BUILDING_BY_ID[b.def].cost.planks ?? 0) - (b.delivered.planks ?? 0));
  return n;
}
/** foragers and fishers needed to feed everyone, from how productive the existing huts actually are */
function rawFoodWorkers(w: World, pop: number) {
  const huts = built(w).filter(b => ['forager', 'dock', 'cellar'].includes(b.def));
  const perWorker = 12 * (huts.length ? huts.reduce((n, b) => n + (bdef(b).recipe!.rate * b.eff), 0) / huts.length : 1.0);
  return Math.max(1, Math.ceil((pop * 2.6) / perWorker));
}

/** How many workers the bot wants in each building right now: essentials first, then the charter, then extras. */
export function staffPlan(w: World): Map<number, number> {
  const pop = alive(w).filter(c => !bedridden(c)).length;
  const ch = w.charter ?? '';
  const want = staffWants(w);
  // a skeleton crew keeps its jobs going and builds with whoever is left
  const extraHands = fixesOf(w).reduce((n, f) => n + ('laborers' in f ? f.laborers : 0), 0);
  const keepFree = (pop <= 5 ? 1 : Math.max(2, Math.ceil(pop / BOT.laborersPer)) + (sites(w).length > 1 ? 1 : 0)) + Math.min(1, extraHands);
  let budget = Math.max(0, pop - keepFree);
  const given: Record<string, number> = {};
  const plan = new Map<number, number>();
  const capacity = (kind: string) => built(w).filter(b => defsOf(kind).includes(b.def) && !blockedReason(w, b)).reduce((n, b) => n + bdef(b).slots, 0);
  const give = (kind: string, upTo: number) => {
    while (budget > 0 && (given[kind] ?? 0) < Math.min(upTo, want[kind] ?? 0, capacity(kind))) { given[kind] = (given[kind] ?? 0) + 1; budget--; }
  };
  // 1. essentials, one each
  // food and wood first: everything else is built from them
  give('rawFood', 1); give('woodcutter', 1); give('kitchen', 1);
  // then what the complaints call for, biggest first
  const serveFixes = () => { for (const f of fixesOf(w)) if ('staff' in f) { want[f.staff] = Math.max(want[f.staff] ?? 0, f.n); give(f.staff, f.n); } };
  const rawStock = w.res.berries + w.res.fish + w.res.mushrooms;
  if (rawStock < pop * 4) give('rawFood', 99);
  if (w.res.wood < 30) give('woodcutter', 99);
  give('clinic', 1);
  serveFixes();
  // planks unlock every mood building, so the sawmill counts as an essential once there's something to spend them on
  give('sawmill', 1);
  // 2. whatever the charter leans on
  const focus: Record<string, string[]> = {
    lumber: ['sawmill'], pieday: ['pieoven', 'sawmill'], feast: ['brewery', 'kitchen'], pantry: ['kitchen', 'rawFood'],
    woodpile: ['woodcutter'], paved: ['woodcutter'], garden: ['sawmill', 'woodcutter'], cheer: ['sawmill', 'woodcutter', 'tavern', 'brewery', 'pieoven'], calm: ['sawmill', 'tavern', 'brewery', 'pieoven'], harmony: ['sawmill', 'woodcutter', 'tavern', 'brewery', 'pieoven'],
  };
  for (const k of focus[ch] ?? []) give(k, 99);
  // 3. everything else, round-robin so no one kind eats the budget
  for (let round = 2; round <= 6; round++) for (const k of ['woodcutter', 'rawFood', 'kitchen', 'sawmill', 'tavern', 'brewery', 'pieoven', 'smokehouse']) give(k, round);
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
  const raw = w.res.berries + w.res.fish + w.res.mushrooms;
  const keep: ResourceId[] = [];
  if (w.charter === 'pieday') keep.push('pie');
  const rawEaters = concernsOf(w).find(c => c.id === 'raw')?.people ?? 0;
  const close = (charterProgress(w)?.ratio ?? 0) >= 0.6;
  if ((w.charter === 'pantry' || w.charter === 'feast') && raw > pop * 3 && (close || rawEaters < pop / 3 || !BOT.advisor || BOT.off.includes('relaxFoodRules'))) keep.push('stew', 'pie', 'smokedFish');
  if (raw < pop * 1.5) keep.length = 0; // never let anyone starve for a charter
  for (const f of ['stew', 'pie', 'smokedFish', 'berries', 'fish', 'mushrooms'] as ResourceId[]) {
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
  if (id === 'storehouse') return centroid(w, ['forager', 'dock', 'kitchen', 'pieoven', 'smokehouse']);
  if (id === 'stockpile' && w.buildings.some(b => b.def === 'stockpile')) return centroid(w, ['woodcutter', 'sawmill', 'brewery']);
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
