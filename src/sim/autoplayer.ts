// A simple heuristic player, used by the balance harness to play thousands of runs headlessly.
import { BUILDING_BY_ID, EVENTS, ResourceId } from './content';
import { World, apply, alive, beds, canAfford, day, mealTotal } from './world';

const BLUEPRINT_PRIORITY = ['kitchen', 'sawmill', 'dock', 'cottage', 'brewery', 'tavern', 'pieoven', 'smokehouse', 'cellar', 'stage', 'bathhouse'];
const PERK_PRIORITY = ['saintsDay', 'ironWill', 'communalPot', 'overtime', 'rations', 'earplugs', 'warmHearth', 'gossipBan', 'matchmaker'];

export function autoDecide(w: World, style: 'greedy' | 'random' = 'greedy', rand = Math.random) {
  while (w.decisions.length) {
    const d = w.decisions[0];
    let option = 0;
    if (style === 'random') {
      const n = d.kind === 'event' ? 2 : d.kind === 'recruit' ? 3 : d.options.length;
      option = Math.floor(rand() * n);
    } else if (d.kind === 'blueprint') {
      option = d.options.map(o => BLUEPRINT_PRIORITY.indexOf(o)).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
    } else if (d.kind === 'perk') {
      option = d.options.map(o => PERK_PRIORITY.indexOf(o)).reduce((best, p, i, arr) => (p < arr[best] ? i : best), 0);
    } else if (d.kind === 'recruit') {
      const score = (c: typeof d.options[number]) => (c.traits.includes('sunny') ? 2 : 0) + (c.traits.includes('diligent') ? 1 : 0)
        - (c.traits.includes('grumbler') ? 2 : 0) - (c.traits.includes('drama') ? 1 : 0) - (c.traits.includes('vain') ? 1 : 0);
      const bestI = d.options.map(score).reduce((b, s, i, arr) => (s > arr[b] ? i : b), 0);
      option = alive(w).length >= beds(w) + 2 ? 99 : bestI; // skip if nobody has a bed
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
    case 'bardPlay': return w.res.ale >= 6;
    case 'pigeonBribe': return w.res.berries >= 15;
    case 'wedding': return mealTotal(w) >= 8 && w.res.ale >= 5;
    case 'outhouseFix': return w.res.planks >= 10;
    case 'peddlerPlanks': return w.res.wood >= 50;
    default: return true;
  }
}

/** Build things the colony can afford, in a sensible order. Called once per in-game hour. */
export function autoBuild(w: World) {
  const pop = alive(w).length;
  const want: string[] = [];
  if (beds(w) < pop + 1) want.push(w.owned.includes('cottage') && w.res.planks >= 15 ? 'cottage' : 'leanto');
  const count = (id: string) => w.buildings.filter(b => b.def === id).length;
  for (const id of BLUEPRINT_PRIORITY) if (w.owned.includes(id) && count(id) === 0) want.push(id);
  if (count('forager') < Math.ceil(pop / 5)) want.push('forager');
  if (count('woodcutter') < Math.ceil(pop / 7)) want.push('woodcutter');
  if (w.owned.includes('kitchen') && count('kitchen') < Math.ceil(pop / 7)) want.push('kitchen');
  for (const id of want) {
    const def = BUILDING_BY_ID[id];
    if (canAfford(w, def) && w.res.wood - (def.cost.wood ?? 0) > 15) { apply(w, { type: 'build', def: id }); if (def.slots) apply(w, { type: 'autoAssign' }); return; }
  }
  if (day(w) && Math.round(w.hour) % 24 === 7) apply(w, { type: 'autoAssign' });
}
