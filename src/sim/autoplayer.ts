// A heuristic player, used by the balance harness to play thousands of runs headlessly.
// It reads the active charter and plays towards it, the way a person would.
import { BUILDING_BY_ID, CHARTERS, EVENTS, ResourceId } from './content';
import { World, apply, alive, beds, mealTotal, sites, findSpot, CENTER, CHARTER_HELPERS, avgMood, built, MAP_SIZE, pathAt, terrainAt, T_WATER, bdef } from './world';

const BLUEPRINT_PRIORITY = ['kitchen', 'sawmill', 'dock', 'cottage', 'brewery', 'tavern', 'pieoven', 'smokehouse', 'cellar', 'stage', 'bathhouse'];
const PERK_PRIORITY = ['saintsDay', 'ironWill', 'communalPot', 'overtime', 'rations', 'earplugs', 'warmHearth', 'gossipBan', 'matchmaker'];
const MOOD_BUILDINGS = ['tavern', 'stage', 'cottage', 'bathhouse', 'pieoven', 'brewery'];

const charterKind = (w: World) => CHARTERS.find(c => c.id === w.charter)?.metric.kind;
const day = (w: World) => Math.floor(w.hour / 24) + 1;

export function autoDecide(w: World, style: 'greedy' | 'random' = 'greedy', rand = Math.random) {
  while (w.decisions.length) {
    const d = w.decisions[0];
    let option = 0;
    if (style === 'random') {
      const n = d.kind === 'event' ? 2 : d.kind === 'recruit' ? 3 : d.options.length;
      option = Math.floor(rand() * n);
    } else if (d.kind === 'charter') {
      // prefer charters we're already close to
      const score = (id: string) => ({ population: 2, stock: 3, buildings: 3, couples: 1, avgMood: 1, feast: 2, contentPop: 0 } as Record<string, number>)[CHARTERS.find(c => c.id === id)!.metric.kind] ?? 0;
      option = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
    } else if (d.kind === 'blueprint') {
      const helpers = CHARTER_HELPERS[w.charter ?? ''] ?? [];
      const rank = (id: string) => (helpers.includes(id) ? -100 + helpers.indexOf(id) : 0) + BLUEPRINT_PRIORITY.indexOf(id);
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
  const saving: ResourceId[] = w.charter === 'lumber' ? ['planks'] : [];
  const pop = alive(w).length;
  const count = (id: string) => w.buildings.filter(b => b.def === id).length;
  if (sites(w).length < 2) {
    const want: string[] = [];
    const pendingBeds = sites(w).reduce((n, b) => n + (BUILDING_BY_ID[b.def].beds ?? 0), 0);
    if (beds(w) + pendingBeds < pop + 1) want.push(w.owned.includes('cottage') && w.res.planks >= 10 && !saving.includes('planks') ? 'cottage' : 'leanto');
    if (count('dining') < Math.ceil(pop / 6)) want.push('dining');
    for (const id of CHARTER_HELPERS[w.charter ?? ''] ?? []) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    for (const id of BLUEPRINT_PRIORITY.slice(0, 2)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    if (count('storehouse') === 0 && day(w) >= 3) want.push('storehouse');
    if (kind === 'avgMood' || kind === 'contentPop' || kind === 'couples' || avgMood(w) < 45) {
      for (const id of MOOD_BUILDINGS) if (w.owned.includes(id) && count(id) === 0) want.push(id);
      if (count('flowerbed') < 6) want.push('flowerbed');
      if (count('statue') < 2 && !saving.includes('planks')) want.push('statue');
      if (count('lantern') < 3) want.push('lantern');
    }
    for (const id of BLUEPRINT_PRIORITY.slice(2)) if (w.owned.includes(id) && count(id) === 0) want.push(id);
    if (count('forager') < Math.ceil(pop / 5)) want.push('forager');
    if (count('woodcutter') < Math.ceil(pop / 6)) want.push('woodcutter');
    if (w.owned.includes('kitchen') && count('kitchen') < Math.ceil(pop / 9)) want.push('kitchen');
    if (w.owned.includes('sawmill') && w.charter === 'lumber' && count('sawmill') < 2) want.push('sawmill');
    for (const id of want) {
      if (sites(w).some(b => b.def === id)) continue;
      const def = BUILDING_BY_ID[id];
      const short = Object.entries(def.cost).some(([r, n]) => w.res[r as ResourceId] < (n ?? 0) + (r === 'wood' ? 10 : 0) || saving.includes(r as ResourceId));
      if (short) continue;
      // decorations go by the hearth; everything else near the centre
      const spot = findSpot(w, id, CENTER, CENTER, !def.decor);
      if (!spot) continue;
      apply(w, { type: 'place', def: id, x: spot.x, y: spot.y });
      break;
    }
  }
  // lay paths from each doorway towards the hearth once wood is comfortable
  if (w.res.wood > 60 && Math.round(w.hour) % 24 === 9) {
    for (const b of built(w)) {
      if (bdef(b).decor || bdef(b).walkable || b.def === 'hearth') continue;
      let x = b.x + Math.floor(bdef(b).w / 2), y = b.y + bdef(b).h;
      for (let i = 0; i < 12 && Math.hypot(x - CENTER, y - CENTER) > 2.5; i++) {
        if (terrainAt(w, x, y) !== T_WATER && pathAt(w, x, y) === 0) apply(w, { type: 'path', x, y, on: true });
        if (Math.abs(x - CENTER) > Math.abs(y - CENTER)) x += Math.sign(CENTER - x); else y += Math.sign(CENTER - y);
      }
    }
  }
  if (Math.round(w.hour) % 24 === 7) apply(w, { type: 'autoAssign' });
  void MAP_SIZE;
}
