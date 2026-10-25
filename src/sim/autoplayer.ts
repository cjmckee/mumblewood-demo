// A heuristic player, used by the balance harness to play thousands of runs headlessly.
// It reads the active charter and plays towards it, the way a person would.
import { BUILDING_BY_ID, CHARTERS, EVENTS, ResourceId } from './content';
import { World, apply, alive, beds, mealTotal, sites, findSpot, CENTER, CHARTER_HELPERS, avgMood, built, MAP_SIZE, pathAt, terrainAt, T_WATER, bdef, workersAt, blockedReason, opinion, Building, Colonist, hourOfDay, charterProgress } from './world';

const BLUEPRINT_PRIORITY = ['sawmill', 'pieoven', 'dock', 'cottage', 'brewery', 'tavern', 'smokehouse', 'cellar', 'stage', 'bathhouse'];
const PERK_PRIORITY = ['saintsDay', 'ironWill', 'communalPot', 'overtime', 'rations', 'earplugs', 'warmHearth', 'gossipBan', 'matchmaker'];
const MOOD_BUILDINGS = ['tavern', 'stage', 'cottage', 'bathhouse', 'pieoven', 'brewery'];

/** how far along a charter would already be if picked now, 0..1 */
function progressIf(w: World, id: string) {
  const saved = { charter: w.charter, hours: w.charterHours, base: w.charterBase };
  w.charter = id; w.charterHours = 0; w.charterBase = { cured: w.stats.cured, errands: w.stats.errands };
  const r = charterProgress(w)?.ratio ?? 0;
  w.charter = saved.charter; w.charterHours = saved.hours; w.charterBase = saved.base;
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
        return progressIf(w, id) * 3 + hold;
      };
      option = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
    } else if (d.kind === 'blueprint') {
      const helpers = CHARTER_HELPERS[w.charter ?? ''] ?? [];
      const feedable = (id: string) => id !== 'smokehouse' || w.owned.includes('dock');
      const rank = (id: string) => (helpers.includes(id) && feedable(id) ? -100 + helpers.indexOf(id) : 0) + BLUEPRINT_PRIORITY.indexOf(id);
      option = d.options.map(rank).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
    } else if (d.kind === 'perk') {
      option = d.options.map(o => PERK_PRIORITY.indexOf(o)).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
    } else if (d.kind === 'recruit') {
      const score = (c: typeof d.options[number]) => (c.traits.includes('sunny') ? 2 : 0) + (c.traits.includes('diligent') ? 1 : 0) + (c.traits.includes('romantic') && w.charter === 'lovebirds' ? 2 : 0)
        - (c.traits.includes('grumbler') ? 2 : 0) - (c.traits.includes('drama') ? 1 : 0) - (c.traits.includes('vain') ? 1 : 0);
      const bestI = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
      const kind = charterKind(w);
      const wantsPeople = kind === 'population' || kind === 'contentPop';
      const cap = wantsPeople ? 30 : 12;
      const ok = alive(w).length < cap && alive(w).length < beds(w) + 2 && (wantsPeople || avgMood(w) > 40);
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
  const maxSites = w.charter === 'township' || w.charter === 'garden' ? 3 : 2;
  if (sites(w).length < maxSites) {
    const want: string[] = [];
    // wood is the economy: keep about one woodcutter per three settlers, more while short

    const pendingBeds = sites(w).reduce((n, b) => n + (BUILDING_BY_ID[b.def].beds ?? 0), 0);
    if (beds(w) + pendingBeds < pop + 1) want.push(w.owned.includes('cottage') && w.res.planks >= 10 && !saving.includes('planks') ? 'cottage' : 'leanto');
    if (count('dining') < Math.ceil(pop / 6)) want.push('dining');
    if (count('kitchen') === 0) want.push('kitchen');
    if (count('clinic') === 0 && (day(w) >= 4 || alive(w).some(c => c.illness))) want.push('clinic');
    for (const id of CHARTER_HELPERS[w.charter ?? ''] ?? []) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    for (const id of BLUEPRINT_PRIORITY.slice(0, 2)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    if (count('storehouse') === 0 && day(w) >= 3) want.push('storehouse');
    const garden = w.charter === 'garden' || w.charter === 'pretty';
    if (garden) { if (count('flowerbed') < 10) want.unshift('flowerbed'); if (count('lantern') < 4) want.push('lantern'); }
    if (kind === 'avgMood' || kind === 'contentPop' || kind === 'couples' || kind === 'calm' || avgMood(w) < 45) {
      for (const id of MOOD_BUILDINGS) if (w.owned.includes(id) && count(id) === 0) want.push(id);
      if (count('flowerbed') < 6) want.push('flowerbed');
      if (count('statue') < 2 && !saving.includes('planks')) want.push('statue');
      if (count('lantern') < 3) want.push('lantern');
      // swap drafty lean-tos for cottages when planks allow
      if (w.owned.includes('cottage') && count('cottage') < Math.ceil(pop / 2) && w.res.planks >= 14) want.unshift('cottage');
    }
    for (const id of BLUEPRINT_PRIORITY.slice(2)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    // only add producers when the colony wants more workers there than it has slots for
    const short = staffShortfall(w);
    if (short.includes('woodcutter')) want.unshift('woodcutter');
    if (short.includes('rawFood')) want.push(w.owned.includes('dock') && count('dock') === 0 ? 'dock' : 'forager');
    if (short.includes('kitchen')) want.push('kitchen');
    for (const k of ['sawmill', 'pieoven', 'brewery']) if (short.includes(k) && w.owned.includes(k)) want.push(k);
    if (count('storehouse') === 0) want.push('storehouse');
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
      // decorations go by the hearth; everything else near the centre
      const spot = findSpot(w, id, CENTER, CENTER, !def.decor);
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
  if (Math.round(hourOfDay(w)) % 3 === 0) autoStaff(w);
  autoFoodRules(w);
  void MAP_SIZE;
}


// ---------- Staffing ----------
/** What the colony wants, in workers per kind of building, before counting how many people it has. */
export function staffWants(w: World): Record<string, number> {
  const pop = alive(w).filter(c => !(c.illness && c.illness.severity > 15)).length;
  const ch = w.charter ?? '';
  const raw = w.res.berries + w.res.fish + w.res.mushrooms;
  return {
    woodcutter: 1 + Math.floor(pop / 5) + (ch === 'woodpile' ? 2 : ['paved', 'garden', 'lumber', 'township'].includes(ch) ? 1 : 0) + (w.res.wood < 25 ? 1 : 0),
    rawFood: rawFoodWorkers(w, pop) + (raw < pop * 3 ? 1 : 0) + (['pantry', 'feast', 'pieday'].includes(ch) ? 1 : 0),
    kitchen: Math.max(1, Math.ceil(pop / 9)) + (['pantry', 'feast'].includes(ch) ? 1 : 0),
    sawmill: (w.res.planks < 25 ? 1 : 0) + (['lumber', 'pieday', 'garden', 'pretty'].includes(ch) ? 1 : 0),
    pieoven: ch === 'pieday' ? 2 : ['cheer', 'feast', 'harmony', 'calm'].includes(ch) ? 1 : 0,
    brewery: ch === 'feast' ? 2 : w.res.ale < 15 && built(w).some(b => b.def === 'tavern') ? 1 : 0,
    smokehouse: w.res.fish > 20 ? 1 : 0,
    tavern: built(w).some(b => b.def === 'tavern') ? 1 : 0,
    clinic: alive(w).some(c => c.illness && c.illness.severity > 15) ? 1 : 0,
  };
}
/** foragers and fishers needed to feed everyone, from how productive the existing huts actually are */
function rawFoodWorkers(w: World, pop: number) {
  const huts = built(w).filter(b => ['forager', 'dock', 'cellar'].includes(b.def));
  const perWorker = 12 * (huts.length ? huts.reduce((n, b) => n + (bdef(b).recipe!.rate * b.eff), 0) / huts.length : 1.0);
  return Math.max(1, Math.ceil((pop * 2.1) / perWorker));
}
const KIND_DEFS: Record<string, string[]> = { rawFood: ['forager', 'dock', 'cellar'] };
const defsOf = (kind: string) => KIND_DEFS[kind] ?? [kind];

/** How many workers the bot wants in each building right now: essentials first, then the charter, then extras. */
export function staffPlan(w: World): Map<number, number> {
  const pop = alive(w).filter(c => !(c.illness && c.illness.severity > 15)).length;
  const ch = w.charter ?? '';
  const want = staffWants(w);
  const keepFree = Math.max(3, Math.ceil(pop / 3.5)) + (sites(w).length > 1 ? 1 : 0);
  let budget = Math.max(0, pop - keepFree);
  const given: Record<string, number> = {};
  const plan = new Map<number, number>();
  const capacity = (kind: string) => built(w).filter(b => defsOf(kind).includes(b.def) && !blockedReason(w, b)).reduce((n, b) => n + bdef(b).slots, 0);
  const give = (kind: string, upTo: number) => {
    while (budget > 0 && (given[kind] ?? 0) < Math.min(upTo, want[kind] ?? 0, capacity(kind))) { given[kind] = (given[kind] ?? 0) + 1; budget--; }
  };
  // 1. essentials, one each
  give('clinic', 1); give('rawFood', 1); give('woodcutter', 1); give('kitchen', 1);
  // 1b. shortages come before everything but the essentials
  const rawStock = w.res.berries + w.res.fish + w.res.mushrooms;
  if (rawStock < pop * 4) give('rawFood', 99);
  if (w.res.wood < 30) give('woodcutter', 99);
  // 2. whatever the charter leans on
  const focus: Record<string, string[]> = {
    lumber: ['sawmill'], pieday: ['pieoven', 'sawmill'], feast: ['brewery', 'kitchen'], pantry: ['kitchen', 'rawFood'],
    woodpile: ['woodcutter'], paved: ['woodcutter'], garden: ['sawmill', 'woodcutter'], cheer: ['pieoven', 'tavern'], calm: ['tavern', 'pieoven'],
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
  let s = c.skills[job] + (c.likes === job ? 3 : 0) - (c.dislikes === job ? 4 : 0);
  for (const o of workersAt(w, b.uid)) if (o.id !== c.id && (opinion(w, c.id, o.id) < -30 || opinion(w, o.id, c.id) < -30)) s -= 4;
  if (c.illness && c.illness.severity > 15) s -= 50;
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
  // then fill gaps from laborers, best fit first
  for (const [uid, n] of [...plan].sort((a, b) => b[1] - a[1])) {
    const b = w.buildings.find(x => x.uid === uid)!;
    while (workersAt(w, uid).length < n) {
      const free = alive(w).filter(c => c.job == null && c.errand == null && !(c.illness && c.illness.severity > 15));
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
  if ((w.charter === 'pantry' || w.charter === 'feast') && raw > pop * 3) keep.push('stew', 'pie', 'smokedFish');
  if (raw < pop * 1.5) keep.length = 0; // never let anyone starve for a charter
  for (const f of ['stew', 'pie', 'smokedFish', 'berries', 'fish', 'mushrooms'] as ResourceId[]) {
    const allowed = !keep.includes(f);
    if (allowed === w.forbidden.includes(f)) apply(w, { type: 'foodRule', food: f, allowed });
  }
}
