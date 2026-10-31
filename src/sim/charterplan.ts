// What a charter would take from where the colony stands: each condition, how close it is, and for goods the shortest
// chain of buildings still missing (build one you own, study it, or draft it). Read-only; used by the charter offer.
import { BUILDINGS, BUILDING_BY_ID, CATEGORIES, CharterMetric, MEALS, RESEARCH, RESOURCES, ResourceId, membersOf, InputKey, RENOWN, TIER } from './content';
import { World, alive, avgMood, beds, built, charterDef, hasPerk, siteOk, tallyOf, renownOf, FEAST_MEALS, FEAST_DRINKS } from './world';
import { START } from './scenario';

/** how a missing building would be got: placed (already known), studied at the desk, or drafted */
export type StepHow = 'build' | 'study' | 'draft';
export interface RouteStep { def: string; how: StepHow; research?: string }
/** ready: something built makes it; steps: buildings still needed, cheapest chain first; never: this map can't */
export interface Route { state: 'ready' | 'steps' | 'never'; steps: RouteStep[]; by?: string }
export interface ConditionPreview { text: string; have: string; met: boolean; route?: Route; routes?: { good: ResourceId; route: Route }[] }
export interface CharterPreview { id: string; conditions: ConditionPreview[]; rewards: string[] }

const STEP_COST: Record<StepHow, number> = { build: 1, study: 2, draft: 3 };
const PLURAL: Partial<Record<ResourceId, string>> = { pie: 'pies', tonic: 'tonics', poultice: 'poultices' };
const resName = (r: ResourceId) => PLURAL[r] ?? RESOURCES.find(x => x.id === r)!.name.toLowerCase();
const KIND: Record<string, string> = { meals: 'meal', drinks: 'drink' };

function howToGet(w: World, def: string): { how: StepHow | 'have'; research?: string } | null {
  const d = BUILDING_BY_ID[def];
  if (!d || !siteOk(w, d)) return null;
  if (built(w).some(b => b.def === def)) return { how: 'have' };
  if (w.owned.includes(def)) return { how: 'build' };
  const r = RESEARCH.find(x => x.unlocks.includes(def));
  if (r) return { how: 'study', research: r.id };
  if (d.draftable) return { how: 'draft' };
  return null;
}

/** the cheapest chain of buildings that would make a good, from what is built, owned, studyable or draftable */
type Found = { cost: number; steps: RouteStep[]; by: string };
export function routeFor(w: World, good: ResourceId, seen: ResourceId[] = []): Found | null {
  if (seen.includes(good) || seen.length > 5) return null;
  let best: Found | null = null;
  for (const d of BUILDINGS) for (const r of d.recipes ?? []) {
    if (r.output !== good) continue;
    const get = howToGet(w, d.id); if (!get) continue;
    let cost = get.how === 'have' ? 0 : STEP_COST[get.how];
    const steps: RouteStep[] = get.how === 'have' ? [] : [{ def: d.id, how: get.how, research: get.research }];
    let ok = true;
    for (const k of Object.keys(r.inputs) as InputKey[]) {
      // an input in stock in quantity is good enough to start; otherwise the cheapest member's chain
      const options = membersOf(k).map(m => routeFor(w, m, [...seen, good])).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.cost - b.cost);
      if (!options.length) { ok = false; break; }
      cost += options[0].cost;
      for (const s of options[0].steps) if (!steps.some(x => x.def === s.def)) steps.push(s);
    }
    if (!ok) continue;
    // fewer steps first, then higher stars (the star order is already a tiebreak through BUILDINGS order)
    if (!best || cost < best.cost) best = { cost, steps, by: d.id };
  }
  return best;
}

const asRoute = (x: { cost: number; steps: RouteStep[]; by?: string } | null): Route => (!x ? { state: 'never', steps: [] } : x.steps.length ? { state: 'steps', steps: x.steps } : { state: 'ready', steps: [], by: x.by });
/** the cheapest route to any of a set of goods (any meal, any drink, any fine material) */
function routeAny(w: World, goods: ResourceId[]): Found | null {
  return goods.map(g => routeFor(w, g)).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.cost - b.cost)[0] ?? null;
}
/** a building on the route: its own route to place it, plus what its fine-material cost needs */
function buildingRoute(w: World, def: string): { cost: number; steps: RouteStep[] } | null {
  const get = howToGet(w, def); if (!get) return null;
  if (get.how === 'have' && built(w).filter(b => b.def === def).length) return { cost: 0, steps: [] };
  const steps: RouteStep[] = get.how === 'have' ? [] : [{ def, how: get.how, research: get.research }];
  let cost = get.how === 'have' ? 0 : STEP_COST[get.how];
  if (BUILDING_BY_ID[def].cost.fine && !(['planks', 'bricks', 'wicker'] as ResourceId[]).some(r => w.res[r] >= (BUILDING_BY_ID[def].cost.fine ?? 0))) {
    const fine = routeAny(w, CATEGORIES.fine.members); if (!fine) return null;
    cost += fine.cost; steps.push(...fine.steps.filter(s => !steps.some(x => x.def === s.def)));
  }
  return { cost, steps };
}

function goodsName(goods: ResourceId[]) {
  for (const c of Object.values(CATEGORIES)) if (c.members.length === goods.length && c.members.every(m => goods.includes(m))) return c.name;
  return goods.map(resName).join(' or ');
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function preview(w: World, m: CharterMetric): ConditionPreview[] {
  const pop = alive(w).length;
  switch (m.kind) {
    case 'population': return [{ text: plural(m.amount, 'colonist'), have: `${pop} now`, met: pop >= m.amount }];
    case 'avgMood': { const mood = Math.round(avgMood(w)); return [{ text: `mood ${m.amount}+ for a day`, have: `${mood} now`, met: mood >= m.amount }]; }
    case 'stock': {
      const have = Math.floor(m.resources.reduce((n, r) => n + w.res[r], 0));
      return [{ text: `${m.amount} ${goodsName(m.resources)}`, have: `${have} stored`, met: have >= m.amount, route: asRoute(routeAny(w, m.resources)) }];
    }
    case 'variety': {
      const members = CATEGORIES[m.category].members;
      const routes = members.map(good => ({ good, r: routeFor(w, good) })).filter(x => x.r).sort((a, b) => a.r!.cost - b.r!.cost);
      const ready = routes.filter(x => !x.r!.steps.length).length;
      const full = members.filter(r => w.res[r] >= m.each).length;
      return [{ text: `${m.kinds} kinds of ${KIND[CATEGORIES[m.category].name] ?? CATEGORIES[m.category].name}, ${m.each} each`, have: `${ready} made here`, met: full >= m.kinds,
        routes: routes.slice(0, m.kinds).map(x => ({ good: x.good, route: asRoute(x.r) })) }];
    }
    case 'tally': {
      const have = Math.floor(tallyOf(w, m.how, m.resources));
      return [{ text: `${m.amount} ${goodsName(m.resources)} ${m.how}`, have: w.charter ? `${have} so far` : `${Math.floor(m.resources.reduce((n, r) => n + w.res[r], 0))} stored`, met: false, route: asRoute(routeAny(w, m.resources)) }];
    }
    case 'renown': {
      const goods = (m.category === 'meal' ? MEALS : CATEGORIES.drink.members).filter(r => RENOWN[TIER[r] ?? 'simple'] > 0);
      const routes = goods.map(good => ({ good, r: routeFor(w, good) })).filter(x => x.r).sort((a, b) => a.r!.cost - b.r!.cost);
      const ready = routes.filter(x => !x.r!.steps.length).length;
      return [{ text: `${m.amount} renown from ${m.kinds} kinds of ${m.category}`, have: `${ready} made here`, met: false,
        routes: routes.slice(0, m.kinds).map(x => ({ good: x.good, route: asRoute(x.r) })) }];
    }
    case 'built': {
      const n = built(w).filter(b => b.def === m.def).length;
      return [{ text: plural(m.amount, BUILDING_BY_ID[m.def].name.toLowerCase()), have: `${n} built`, met: n >= m.amount, route: n >= m.amount ? undefined : asRoute(buildingRoute(w, m.def)) }];
    }
    case 'everyoneBed': { const b = beds(w); return [{ text: 'a bed for everyone', have: `${b} beds`, met: b >= pop }]; }
    case 'allTable': {
      const table = buildingRoute(w, 'dining'), meal = routeAny(w, MEALS);
      const steps = [...(table?.steps ?? []), ...(meal?.steps ?? []).filter(s => !table?.steps.some(x => x.def === s.def))];
      return [{ text: `a day of ${m.cooked ? 'cooked ' : ''}meals at a table`, have: '', met: false, route: !table || !meal ? { state: 'never', steps: [] } : asRoute({ cost: 0, steps }) }];
    }
    case 'healthy': return [{ text: 'a day with nobody sick', have: '', met: false }];
    case 'monument': {
      const stages = BUILDING_BY_ID[m.def].stages ?? [];
      return stages.map(s => {
        const k = Object.keys(s.cost)[0] as InputKey, n = s.cost[k as keyof typeof s.cost] ?? 0;
        return { text: `${n} ${CATEGORIES[k as keyof typeof CATEGORIES]?.name ?? resName(k as ResourceId)}`, have: s.label.toLowerCase(), met: false, route: asRoute(routeAny(w, membersOf(k))) };
      });
    }
    case 'longTable': return [
      { text: plural(m.pop, 'colonist') + ' at one feast', have: `${pop} now`, met: pop >= m.pop },
      { text: 'a magnificent meal each', have: '', met: false, route: asRoute(routeAny(w, FEAST_MEALS)) },
      { text: 'a refined drink each', have: '', met: false, route: asRoute(routeAny(w, FEAST_DRINKS)) },
    ];
    case 'all': return m.parts.flatMap(p => preview(w, p));
  }
  return [];
}

export function charterPreview(w: World, id: string): CharterPreview {
  const def = charterDef(id)!;
  const conditions = preview(w, def.metric);
  const rewards: string[] = [];
  if (def.tier === 3) rewards.push('wins the run');
  else {
    const stipend = (START.trade.stipend[def.tier - 1] ?? 0) * (hasPerk(w, 'crownsFavour') ? 2 : 1);
    if (stipend) rewards.push(`${stipend} gold`);
    rewards.push(`strain −${Math.round(START.relief.charter * 100)}%`, 'a cornerstone');
  }
  return { id, conditions, rewards };
}

/** routes for one condition while the charter is under way: the missing buildings for its goods (per kind for variety) */
export function metricRoutes(w: World, m: CharterMetric): { good?: InputKey; route: Route }[] {
  switch (m.kind) {
    case 'stock': return [{ route: asRoute(routeAny(w, m.resources)) }];
    case 'tally': return tallyOf(w, m.how, m.resources) >= m.amount ? [] : [{ route: asRoute(routeAny(w, m.resources)) }];
    case 'renown': {
      const { points, kinds } = renownOf(w, m.category);
      if (points >= m.amount && kinds.length >= m.kinds) return [];
      // the kinds not yet counting, cheapest first, as many as are still needed (at least one, to raise the renown)
      const goods = (m.category === 'meal' ? MEALS : CATEGORIES.drink.members).filter(r => RENOWN[TIER[r] ?? 'simple'] > 0 && !kinds.includes(r));
      return goods.map(good => ({ good, r: routeFor(w, good) })).filter(x => x.r).sort((a, b) => a.r!.cost - b.r!.cost)
        .slice(0, Math.max(1, m.kinds - kinds.length)).map(x => ({ good: x.good, route: asRoute(x.r) }));
    }
    case 'variety': {
      const members = CATEGORIES[m.category].members;
      const have = members.filter(r => w.res[r] >= m.each).length;
      if (have >= m.kinds) return [];
      // the kinds still short, cheapest first, as many as are still needed
      return members.filter(r => w.res[r] < m.each).map(good => ({ good, r: routeFor(w, good) })).filter(x => x.r)
        .sort((a, b) => a.r!.cost - b.r!.cost).slice(0, m.kinds - have).map(x => ({ good: x.good, route: asRoute(x.r) }));
    }
    case 'built': return [{ route: asRoute(buildingRoute(w, m.def)) }];
    case 'allTable': {
      const table = buildingRoute(w, 'dining'), meal = routeAny(w, MEALS);
      if (!table || !meal) return [{ route: { state: 'never', steps: [] } }];
      return [{ route: asRoute({ cost: 0, steps: [...table.steps, ...meal.steps.filter(s => !table.steps.some(x => x.def === s.def))] }) }];
    }
    case 'monument': {
      const b = w.buildings.find(x => x.def === m.def);
      const stage = BUILDING_BY_ID[m.def].stages?.[b?.stage ?? 0];
      if (!b) return [{ route: asRoute(buildingRoute(w, m.def)) }];
      if (b.built || !stage) return [];
      const k = Object.keys(stage.cost)[0] as InputKey;
      return [{ route: asRoute(routeAny(w, membersOf(k))) }];
    }
    case 'longTable': return [{ good: FEAST_MEALS[0], route: asRoute(routeAny(w, FEAST_MEALS)) }, { good: FEAST_DRINKS[0], route: asRoute(routeAny(w, FEAST_DRINKS)) }];
    default: return [];
  }
}
